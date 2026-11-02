import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createBuyClient, type Limits } from "../src/buy.js";
import { BudgetError, MemoryLedger } from "../src/ledger.js";
import { paymentsFromLogs } from "../src/rebuild.js";
import { TOKENS } from "../src/tokens.js";

const LIMITS: Limits = { perCallCapAtomic: 20_000n, reportCapAtomic: 30_000n, dailyCapAtomic: 50_000n };
const SELLER = "0x000000000000000000000000000000000000bEEF" as const;
const TX = ("0x" + "ab".repeat(32)) as `0x${string}`;

/** Fake seller: answers 402 until an X-PAYMENT header arrives, then 200 with a settlement receipt. No network. */
function fakeSeller(price: string, asset: string = TOKENS.USDC.address) {
  const calls = { paid: 0, unpaid: 0 };
  const impl = (async (_url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (!headers.get("X-PAYMENT")) {
      calls.unpaid++;
      return new Response(
        JSON.stringify({
          x402Version: 1,
          error: "payment required",
          accepts: [
            {
              scheme: "exact",
              network: "celo",
              maxAmountRequired: price,
              resource: "https://seller.example/x",
              description: "test",
              mimeType: "application/json",
              payTo: SELLER,
              maxTimeoutSeconds: 60,
              asset,
              extra: { name: "USDC", version: "2" },
            },
          ],
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      );
    }
    calls.paid++;
    const receipt = Buffer.from(JSON.stringify({ success: true, transaction: TX, network: "celo" })).toString("base64");
    return new Response('{"ok":true}', { status: 200, headers: { "X-PAYMENT-RESPONSE": receipt } });
  }) as typeof fetch;
  return { impl, calls };
}

function client(price: string, limits = LIMITS, asset?: string) {
  const seller = fakeSeller(price, asset);
  const ledger = new MemoryLedger();
  // Throwaway key generated in-test. Never funded.
  const buy = createBuyClient({ account: privateKeyToAccount(generatePrivateKey()), ledger, limits, fetchImpl: seller.impl });
  const call = (over: Partial<Parameters<typeof buy.pay>[0]> = {}) =>
    buy.pay({ service: "test/service", purpose: "test", reportId: "r1", url: "https://seller.example/x", maxAmountAtomic: 20_000n, ...over });
  return { buy, ledger, seller, call };
}

describe("spend guard (fails closed)", () => {
  it("pays within the caps and records a receipt with the settlement hash", async () => {
    const { ledger, seller, call } = client("10000");
    const res = await call();
    expect(res.status).toBe(200);
    expect(seller.calls.paid).toBe(1);
    const [row] = await ledger.list(10);
    expect(row).toMatchObject({ amountAtomic: 10_000n, token: "USDC", status: "confirmed", txHash: TX });
  });

  it("refuses a quote above the per-call cap before anything is paid", async () => {
    const { ledger, seller, call } = client("25000");
    await expect(call()).rejects.toThrow();
    expect(seller.calls.paid).toBe(0);
    expect(await ledger.list(10)).toHaveLength(0);
  });

  it("refuses a requested max above the per-call cap", async () => {
    const { call } = client("10000");
    await expect(call({ maxAmountAtomic: 20_001n })).rejects.toMatchObject({ code: "per_call_cap" });
  });

  it("stops at the per-report cap", async () => {
    const { seller, call } = client("10000");
    await call();
    await call();
    await call();
    await expect(call()).rejects.toMatchObject({ code: "report_cap" });
    expect(seller.calls.paid).toBe(3);
  });

  it("stops at the daily cap across reports", async () => {
    const { seller, call } = client("20000", { ...LIMITS, reportCapAtomic: 1_000_000n });
    await call({ reportId: "a" });
    await call({ reportId: "b" });
    await expect(call({ reportId: "c" })).rejects.toMatchObject({ code: "daily_cap" });
    expect(seller.calls.paid).toBe(2);
  });

  it("refuses a token we do not pay with", async () => {
    const { seller, call } = client("10000", LIMITS, "0x1111111111111111111111111111111111111111");
    await expect(call()).rejects.toThrow();
    expect(seller.calls.paid).toBe(0);
  });

  it("fails closed when the ledger is unavailable", async () => {
    const seller = fakeSeller("10000");
    const broken = {
      reserve: async () => {
        throw new BudgetError("ledger_unavailable", "down");
      },
      settle: async () => {},
      list: async () => [],
      spentToday: async () => 0n,
    };
    const buy = createBuyClient({ account: privateKeyToAccount(generatePrivateKey()), ledger: broken, limits: LIMITS, fetchImpl: seller.impl });
    await expect(
      buy.pay({ service: "s", purpose: "p", reportId: "r", url: "https://seller.example/x", maxAmountAtomic: 10_000n }),
    ).rejects.toThrow();
    expect(seller.calls.paid).toBe(0);
  });
});

describe("ledger rebuild from onchain transfers", () => {
  it("keeps outgoing stablecoin transfers and drops self-transfers and unknown tokens", () => {
    const agent = "0x03EBE0eff969718958f54cc2e10FA21784D70fC3" as const;
    const logs = [
      { transactionHash: TX, blockNumber: 2n, address: TOKENS.USDC.address as `0x${string}`, args: { to: SELLER, value: 10_000n } },
      { transactionHash: TX, blockNumber: 1n, address: TOKENS.USAT.address as `0x${string}`, args: { to: SELLER, value: 5_000n } },
      { transactionHash: TX, blockNumber: 3n, address: TOKENS.USDC.address as `0x${string}`, args: { to: agent, value: 1n } },
      { transactionHash: TX, blockNumber: 4n, address: "0x1111111111111111111111111111111111111111" as const, args: { to: SELLER, value: 1n } },
    ];
    const out = paymentsFromLogs(logs, agent);
    expect(out.map((p) => p.token)).toEqual(["USAT", "USDC"]);
    expect(out[1]?.amountAtomic).toBe(10_000n);
  });
});
