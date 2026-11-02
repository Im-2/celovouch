// Generates the agent wallet key into .env without ever printing it.
// Prints the PUBLIC address only. Refuses to overwrite an existing key.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const envPath = new URL("../.env", import.meta.url);
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

if (/^AGENT_PRIVATE_KEY=0x[0-9a-fA-F]{64}\s*$/m.test(existing)) {
  const key = existing.match(/^AGENT_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m)[1];
  console.log("A key already exists in .env. Not overwriting.");
  console.log("Agent address:", privateKeyToAccount(key).address);
  process.exit(0);
}

const key = generatePrivateKey();
const address = privateKeyToAccount(key).address;
const sep = existing === "" || existing.endsWith("\n") ? "" : "\n";
writeFileSync(envPath, `${existing}${sep}AGENT_PRIVATE_KEY=${key}\nAGENT_ADDRESS=${address}\n`, {
  mode: 0o600,
});
console.log("Wrote AGENT_PRIVATE_KEY to .env (not shown).");
console.log("Agent address:", address);
