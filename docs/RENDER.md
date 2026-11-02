# Deploying celovouch on Render

Render's free tier (checked against Render's docs): a free web service spins down after 15 minutes without traffic and takes about a minute to wake. Its disk is ephemeral and persistent disks are not available. The free Postgres database is 1 GB, and expires 30 days after creation with a 14-day grace period. So the receipts ledger lives in Postgres, not local files, and it can be rebuilt from onchain transfers (`src/rebuild.ts`) if the database is lost.

## Checklist

1. Sign in at render.com and connect your GitHub account to the `Im-2/celovouch` repo.
2. New > Blueprint, pick this repo. Render reads `render.yaml` and creates the web service `celovouch` (type: Web Service, runtime Node, plan Free) and the free Postgres `celovouch-db`.
3. Build command: `npm ci`. Start command: `npm start`. Health check path: `/health`. Node: 22 (set by `NODE_VERSION=22` and `.node-version`).
4. Fill the environment variables that Render asks for (values are never in the repo):

| Name | Where the value comes from |
|---|---|
| `DATABASE_URL` | Automatic, linked from `celovouch-db` by the blueprint |
| `NODE_VERSION` | Already set to `22` in `render.yaml` |
| `PUBLIC_BASE_URL` | The service's `https://....onrender.com` URL, shown after the first deploy. Set it, then redeploy |
| `AGENT_ADDRESS` | Public address from your local `.env` (`AGENT_ADDRESS`) |
| `AGENT_PRIVATE_KEY` | Your local `.env`. Paste it into the Render dashboard only. Never commit it or paste it in chat |
| `ATTRIBUTION_TAG` | `loops project get --event agents-on-open-rails` (`celo.attributionTag`) |
| `X402_API_KEY` | Create it at https://x402.celo.org (connect the wallet, sign, copy once). Needed when the paywall ships |
| `AGENT_ID` | Left empty until the ERC-8004 registration is done, then set it |
| `PER_CALL_CAP_ATOMIC`, `REPORT_CAP_ATOMIC`, `DAILY_CAP_ATOMIC` | Preset in `render.yaml` (0.02 / 0.10 / 1.00 in 6-decimal units). Change only on purpose |

5. After the first deploy, open `https://<your-service>.onrender.com/health` and `/.well-known/agent-registration.json` to confirm they load.
6. Tell Claude the live URL. Registration then runs as a dry run first: `node scripts/register.mjs`. Sending it needs the funded wallet and your approval.
7. Optional: free instances sleep when idle, so the first paid request after a quiet spell can take about a minute. An external uptime pinger on `/health` avoids that (one always-on service fits inside the 750 free hours a month).
