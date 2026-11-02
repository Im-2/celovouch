import { parseAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { TOKENS, type TokenSymbol } from "./tokens.js";

export type OnchainPayment = {
  txHash: Hex;
  blockNumber: bigint;
  token: TokenSymbol;
  to: Address;
  amountAtomic: bigint;
};

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

type TransferLog = { transactionHash: Hex; blockNumber: bigint; address: Address; args: { to?: Address; value?: bigint } };

/** Pure: turns raw Transfer logs sent by the agent wallet into payment records. Self-transfers are dropped. */
export function paymentsFromLogs(logs: TransferLog[], agent: Address): OnchainPayment[] {
  const out: OnchainPayment[] = [];
  for (const log of logs) {
    const token = (Object.keys(TOKENS) as TokenSymbol[]).find((s) => TOKENS[s].address.toLowerCase() === log.address.toLowerCase());
    if (!token || !log.args.to || log.args.value === undefined) continue;
    if (log.args.to.toLowerCase() === agent.toLowerCase()) continue;
    out.push({ txHash: log.transactionHash, blockNumber: log.blockNumber, token, to: log.args.to, amountAtomic: log.args.value });
  }
  return out.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));
}

/**
 * Reads every stablecoin Transfer out of the agent wallet between two blocks. The onchain
 * record is the source of truth: if the database is lost, the ledger can be rebuilt from it
 * (service and purpose labels are lost, amounts, tokens, recipients and tx hashes are not).
 */
export async function fetchAgentPayments(client: PublicClient, agent: Address, fromBlock: bigint, toBlock: bigint) {
  const logs = (await client.getLogs({
    address: (Object.keys(TOKENS) as TokenSymbol[]).map((s) => TOKENS[s].address),
    event: TRANSFER,
    args: { from: agent },
    fromBlock,
    toBlock,
  })) as unknown as TransferLog[];
  return paymentsFromLogs(logs, agent);
}
