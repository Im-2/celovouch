import { IDENTITY_REGISTRY } from "./chain.js";

/** ERC-8004 registration file (registration-v1). `registrations` is filled once the agent ID exists. */
export function buildRegistrationFile(opts: { baseUrl: string; agentAddress: string; agentId?: number }) {
  const { baseUrl, agentAddress, agentId } = opts;
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "celovouch",
    description:
      "A paid x402 service that answers one question before an agent pays another agent: should I pay this one? Returns a verdict, a score and evidence links, computed by deterministic code over onchain data.",
    image: `${baseUrl}/icon.svg`,
    services: [
      { name: "web", endpoint: `${baseUrl}/` },
      { name: "wallet", endpoint: `eip155:42220:${agentAddress}` },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ["reputation"],
    registrations: agentId === undefined ? [] : [{ agentId, agentRegistry: `eip155:42220:${IDENTITY_REGISTRY}` }],
  };
}
