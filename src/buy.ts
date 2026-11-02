import { x402 } from "@celo/buy-core";
import type { LocalAccount } from "viem";
import { BudgetError, type Caps, type Ledger } from "./ledger.js";
import { TOKENS, type TokenSymbol } from "./tokens.js";

export type Limits = Caps & {
  /** Hard ceiling for any single payment, in atomic units. */
  perCallCapAtomic: bigint;
};

/** $0.02 per call, $0.10 per report, $1.00 per day. Override with env vars, never raise silently. */
export const DEFAULT_LIMITS: Limits = {
  perCallCapAtomic: 20_000n,
  reportCapAtomic: 100_000n,
  dailyCapAtomic: 1_000_000n,
};

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): Limits {
  const pick = (name: string, fallback: bigint) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback;
    if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number of atomic units`);
    return BigInt(raw);
  };
  return {
    perCallCapAtomic: pick("PER_CALL_CAP_ATOMIC", DEFAULT_LIMITS.perCallCapAtomic),
    reportCapAtomic: pick("REPORT_CAP_ATOMIC", DEFAULT_LIMITS.reportCapAtomic),
    dailyCapAtomic: pick("DAILY_CAP_ATOMIC", DEFAULT_LIMITS.dailyCapAtomic),
  };
}

export type PayCall = {
  /** Which bought service, e.g. "chainstack/celo-rpc". Recorded in the receipts ledger. */
  service: string;
  /** Why this call is in the pipeline, e.g. "transfer logs into the payTo wallet". */
  purpose: string;
  reportId: string;
  url: string;
  init?: RequestInit;
  /** Required. The most this one call may cost, in atomic units. Must not exceed the per-call cap. */
  maxAmountAtomic: bigint;
  token?: TokenSymbol;
};

function tokenForAsset(asset: string): TokenSymbol | undefined {
  return (Object.keys(TOKENS) as TokenSymbol[]).find((s) => TOKENS[s].address.toLowerCase() === asset.toLowerCase());
}

/**
 * The only way the server pays buy. It signs with the agent key through @celo/buy-core's
 * payingFetch, reserves the amount in the ledger before anything is signed, and fails
 * closed: a cap hit, an unknown token, or an unreachable ledger all abort the payment.
 */
export function createBuyClient(deps: {
  account: LocalAccount;
  ledger: Ledger;
  limits: Limits;
  fetchImpl?: typeof fetch;
}) {
  const { account, ledger, limits } = deps;

  return {
    async pay(call: PayCall): Promise<Response> {
      if (call.maxAmountAtomic <= 0n || call.maxAmountAtomic > limits.perCallCapAtomic) {
        throw new BudgetError("per_call_cap", "Requested max amount is outside the per-call cap. Refusing to pay.");
      }
      let reservation: number | undefined;
      let reservedToken = "unknown";

      return x402.payingFetch(
        { account, network: "celo", preferredToken: call.token ?? "USDC", fetchImpl: deps.fetchImpl },
        call.url,
        {
          ...call.init,
          maxAmount: call.maxAmountAtomic,
          // Our own check runs right before signing; throwing here aborts the payment.
          async onBeforePayment(req) {
            const symbol = tokenForAsset(req.asset);
            if (!symbol) throw new BudgetError("unknown_asset", "Challenge asks for a token we do not pay with. Refusing to pay.");
            const amount = BigInt(req.maxAmountRequired);
            if (amount > limits.perCallCapAtomic || amount > call.maxAmountAtomic) {
              throw new BudgetError("per_call_cap", "Quoted price is above the cap. Refusing to pay.");
            }
            reservedToken = symbol;
            reservation = await ledger.reserve(
              {
                reportId: call.reportId,
                service: call.service,
                purpose: call.purpose,
                url: call.url,
                token: symbol,
                amountAtomic: amount,
              },
              limits,
            );
          },
          async onPayment(info) {
            if (reservation === undefined) return;
            await ledger.settle(reservation, { status: info.outcome, txHash: info.txHash, poll: info.poll });
          },
          onAccountingError(err) {
            console.error("receipt bookkeeping failed for", reservedToken, err instanceof Error ? err.message : "unknown");
          },
        },
      );
    },
  };
}
