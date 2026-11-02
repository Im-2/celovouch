// ERC-8004 registration on Celo mainnet. Dry run by default: no network, no key use, no transaction.
//   node scripts/register.mjs                     dry run, prints what would be sent
//   node scripts/register.mjs --send              sends the tagged register() transaction
// Needs PUBLIC_BASE_URL, ATTRIBUTION_TAG (and AGENT_PRIVATE_KEY for --send) in .env or the environment.
import { fromDataSuffix, withAttribution } from "@celo/attribution-tags";
import { readFileSync, existsSync } from "node:fs";
import { concat, createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const env = { ...process.env };
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
// USDC fee-currency adapter on Celo (6-decimal token, so the adapter is used, not the token).
const USDC_FEE_ADAPTER = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B";
const abi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

const base = (env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
if (!/^https:\/\/[^/]+\.[^/]+$/.test(base)) throw new Error("PUBLIC_BASE_URL must be the live https URL, e.g. https://celovouch.onrender.com");
const tag = env.ATTRIBUTION_TAG;
if (!/^celo_[a-z0-9]{12}$/.test(tag ?? "")) throw new Error("ATTRIBUTION_TAG missing or malformed");

const agentURI = `${base}/.well-known/agent-registration.json`;
const calldata = encodeFunctionData({ abi, functionName: "register", args: [agentURI] });
const tagged = concat([calldata, (await import("@celo/attribution-tags")).toDataSuffix(tag)]);
const decoded = fromDataSuffix(tagged);

console.log("registry:    ", REGISTRY);
console.log("agentURI:    ", agentURI);
console.log("calldata:    ", `${(tagged.length - 2) / 2} bytes, carries tag: ${decoded?.codes.join(",")}`);
if (!decoded?.codes.includes(tag)) throw new Error("tag not present in calldata. Refusing.");

// The live registration file must already be served, or the URI is not real.
const live = await fetch(agentURI).catch(() => undefined);
console.log("file live:   ", live?.ok ? "yes" : `NO (${live?.status ?? "unreachable"})`);

if (!process.argv.includes("--send")) {
  console.log("\nDry run only. Re-run with --send after funding the wallet and approving the transaction.");
  process.exit(0);
}
if (!live?.ok) throw new Error("registration file is not live at the agentURI. Deploy first. Refusing to register.");

const key = env.AGENT_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("AGENT_PRIVATE_KEY missing");
const account = privateKeyToAccount(key);
const transport = http("https://forno.celo.org");
const pub = createPublicClient({ chain: celo, transport });
// withAttribution appends the tag to every transaction this client sends.
const wallet = createWalletClient({ account, chain: celo, transport }).extend(withAttribution(tag));

const hash = await wallet.writeContract({
  address: REGISTRY,
  abi,
  functionName: "register",
  args: [agentURI],
  feeCurrency: env.FEE_IN_CELO === "1" ? undefined : USDC_FEE_ADAPTER,
});
console.log("tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
const [ev] = parseEventLogs({ abi, logs: receipt.logs, eventName: "Registered" });
console.log("status:", receipt.status);
console.log("agentId:", ev?.args.agentId?.toString() ?? "(not found in logs)");
console.log("Set AGENT_ID to that number in the Render dashboard and your .env, then verify the tag with verifyTx.");
