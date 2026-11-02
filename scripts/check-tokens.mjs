// Read-only check of the payment tokens on Celo mainnet (no key, no transaction).
import { createPublicClient, http, parseAbi } from "viem";
import { celo } from "viem/chains";

const client = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
const abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function version() view returns (string)",
]);
const tokens = {
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  USAT: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
};
for (const [label, address] of Object.entries(tokens)) {
  const out = { label, address };
  for (const fn of ["name", "symbol", "decimals", "version"]) {
    try {
      out[fn] = String(await client.readContract({ address, abi, functionName: fn }));
    } catch {
      out[fn] = "(n/a)";
    }
  }
  console.log(JSON.stringify(out));
}
