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
| `GET /v1/report` | returns 501 until the x402 paywall ships |

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
