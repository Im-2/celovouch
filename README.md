# celovouch

A paid x402 service that answers one question before an agent pays another agent: **should I pay this one?**

Built solo for Celo's Agents on Open Rails hackathon. Code in this repo was written during the hackathon.

> Status: skeleton. The paid report endpoint, the buy-powered data pipeline and the dashboard are not built yet. Nothing here claims usage or volume.

## What exists today

| Endpoint | State |
|---|---|
| `GET /health` | live |
| `GET /v1/sample` | live, a fixed example about a fictional agent |
| `GET /.well-known/agent-registration.json` | live, ERC-8004 registration-v1 file |
| `GET /v1/receipts` | live, the public ledger of buy payments (empty until we pay) |
| `GET /v1/report` | returns 501 until the x402 paywall ships |

## How the server pays buy

The server pays buy services through `@celo/buy-core`'s `payingFetch` (the library the `buy` CLI is built on), signing with the agent wallet's key from an environment variable. We do not shell out to the `buy` CLI: its file keystore does not support mainnet, so it cannot run on a cloud host.

Our own code wraps every payment in `src/buy.ts` and fails closed:

- a required per-call maximum, a per-report budget and a daily budget (defaults $0.02, $0.10 and $1.00, set in atomic units);
- a ledger reservation is written before anything is signed, and an unreachable ledger, an unknown token or a cap hit all abort the payment;
- every payment is recorded (service, purpose, token, amount, settlement tx hash) and exposed at `GET /v1/receipts` as the proof of payment for the Build with buy track.

The Build with buy track needs no attribution tag, only the list of services used and proof of payment, which is what `/v1/receipts` provides.

## Receipts storage

The ledger lives in Postgres (`DATABASE_URL`) so it survives restarts and Render's ephemeral disk. It can be rebuilt from onchain stablecoin transfers out of the agent wallet (`src/rebuild.ts`): amounts, tokens, recipients and tx hashes come back, service and purpose labels do not. Without `DATABASE_URL` the server uses an in-memory ledger and says so at boot.

Deploy notes are in [docs/RENDER.md](docs/RENDER.md).

## Run it

Needs Node 22.5 or newer. No secrets are needed to run the skeleton or the tests.

```sh
npm install
npm test
AGENT_ADDRESS=0x03EBE0eff969718958f54cc2e10FA21784D70fC3 npm start
```

## Attribution tag

Every transaction the agent wallet sends must carry the hackathon's ERC-8021 tag, and a tag cannot be added later. The wallet client is built in one place, `src/chain.ts`, and throws if the tag is missing. `test/attribution.test.ts` checks offline that a signed transaction carries it.

## Honesty notes

- Test wallets and test transactions will be labelled as tests here and in the submission.
- The dashboard will report independent payers using the hackathon's exact definition, whatever the number is.
- Gas sponsorship: buy's gateway sponsors gas on its own x402 settlements, and Celo's facilitator pays settlement gas. That is not our contribution.
