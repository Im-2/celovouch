import { fromDataSuffix } from "@celo/attribution-tags";
import { custom, parseTransaction, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { agentWalletClient } from "../src/chain.js";

const TAG = "celo_ab8c1ef2cd72";

/** A transport that answers the RPC calls viem makes before sending, and captures the signed tx. No network. */
function offlineTransport(captured: { raw?: Hex }) {
  return custom({
    async request({ method }: { method: string }) {
      switch (method) {
        case "eth_chainId":
          return "0xa4ec";
        case "eth_getTransactionCount":
          return "0x0";
        case "eth_estimateGas":
          return "0x30000";
        case "eth_gasPrice":
        case "eth_maxPriorityFeePerGas":
          return "0x3b9aca00";
        case "eth_getBlockByNumber":
          return { number: "0x1", baseFeePerGas: "0x3b9aca00", timestamp: "0x1", transactions: [] };
        case "eth_sendRawTransaction":
          throw new Error("captured");
        default:
          throw new Error(`unexpected rpc ${method}`);
      }
    },
  });
}

describe("attribution tag", () => {
  it("is appended to a plain send by the wallet client", async () => {
    // Throwaway key generated in-test. Never funded, never used on a network.
    const captured: { raw?: Hex } = {};
    const transport = custom({
      async request({ method, params }: { method: string; params?: unknown[] }) {
        if (method === "eth_sendRawTransaction") {
          captured.raw = (params as Hex[])[0];
          return "0x" + "11".repeat(32);
        }
        return offlineTransport(captured)({ chain: undefined, retryCount: 0 }).request({ method, params } as never);
      },
    });
    const wallet = agentWalletClient({ privateKey: generatePrivateKey(), attributionTag: TAG, transport });
    await wallet.sendTransaction({ to: "0x000000000000000000000000000000000000dEaD", value: 0n });

    expect(captured.raw).toBeDefined();
    const tx = parseTransaction(captured.raw!);
    const decoded = fromDataSuffix((tx.data ?? "0x") as Hex);
    expect(decoded?.codes).toContain(TAG);
  });

  it("refuses to build a client without a valid tag", () => {
    const key = generatePrivateKey();
    expect(() => agentWalletClient({ privateKey: key, attributionTag: undefined })).toThrow(/ATTRIBUTION_TAG/);
    expect(() => agentWalletClient({ privateKey: key, attributionTag: "celo_short" })).toThrow(/ATTRIBUTION_TAG/);
  });
});
