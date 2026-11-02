import { isAddress, type Address } from "viem";

const TAG_PATTERN = /^celo_[a-z0-9]{12}$/;

export function requireAttributionTag(raw: string | undefined): string {
  if (!raw || !TAG_PATTERN.test(raw)) {
    throw new Error("ATTRIBUTION_TAG is missing or malformed (expected celo_ plus 12 lowercase hex characters)");
  }
  return raw;
}

export function requireAddress(name: string, raw: string | undefined): Address {
  if (!raw || !isAddress(raw)) throw new Error(`${name} is missing or not a valid address`);
  return raw;
}

export type PublicConfig = {
  port: number;
  /** Public base URL of the deployed server, used in the registration file. */
  baseUrl: string;
  /** The wallet that owns the ERC-8004 identity and receives x402 payments. */
  agentAddress: Address;
};

/** Everything the skeleton needs. Holds no secrets: the private key is read only in chain.ts. */
export function loadPublicConfig(env: NodeJS.ProcessEnv = process.env): PublicConfig {
  return {
    port: Number(env.PORT ?? 8787),
    baseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:8787").replace(/\/$/, ""),
    agentAddress: requireAddress("AGENT_ADDRESS", env.AGENT_ADDRESS),
  };
}
