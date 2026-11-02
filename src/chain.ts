import { withAttribution } from "@celo/attribution-tags";
import { createPublicClient, createWalletClient, http, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { requireAttributionTag } from "./config.js";

export const CELO_RPC = "https://forno.celo.org";

/** ERC-8004 registries on Celo mainnet. */
export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

export function publicClient(transport: Transport = http(CELO_RPC)) {
  return createPublicClient({ chain: celo, transport });
}

/**
 * The only place a wallet client is built. Every transaction sent through it
 * carries the hackathon attribution tag, because a tag cannot be added later.
 * It throws if the tag is missing, so an untagged client cannot exist.
 */
export function agentWalletClient(opts: {
  privateKey: string;
  attributionTag: string | undefined;
  transport?: Transport;
}) {
  const tag = requireAttributionTag(opts.attributionTag);
  if (!/^0x[0-9a-fA-F]{64}$/.test(opts.privateKey)) throw new Error("AGENT_PRIVATE_KEY is not a 32-byte hex key");
  return createWalletClient({
    account: privateKeyToAccount(opts.privateKey as `0x${string}`),
    chain: celo,
    transport: opts.transport ?? http(CELO_RPC),
  }).extend(withAttribution(tag));
}
