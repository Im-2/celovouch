import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadPublicConfig, type PublicConfig } from "./config.js";
import { MemoryLedger, PgLedger, type Ledger } from "./ledger.js";
import { buildRegistrationFile } from "./registration.js";
import { SAMPLE_REPORT } from "./sample.js";

export function createApp(cfg: PublicConfig, opts: { agentId?: number; ledger?: Ledger } = {}) {
  const app = new Hono();
  const ledger = opts.ledger ?? new MemoryLedger();

  // Public proof of payment for the buy track: every payment we made through buy.
  app.get("/v1/receipts", async (c) => {
    const rows = await ledger.list(200);
    return c.json({
      payer: cfg.agentAddress,
      note: "Every buy payment this server made. Test calls are labelled in the README.",
      receipts: rows.map((r) => ({
        id: r.id,
        service: r.service,
        purpose: r.purpose,
        token: r.token,
        amountAtomic: r.amountAtomic.toString(),
        txHash: r.txHash,
        status: r.status,
        reportId: r.reportId,
        at: r.createdAt.toISOString(),
      })),
    });
  });

  app.get("/health", (c) => c.json({ ok: true, service: "celovouch" }));

  app.get("/icon.svg", (c) =>
    c.body(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#fcff52"/><path d="M18 34l10 10 18-22" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      200,
      { "content-type": "image/svg+xml" },
    ),
  );

  app.get("/v1/sample",(c) => c.json(SAMPLE_REPORT));

  app.get("/.well-known/agent-registration.json", (c) =>
    c.json(buildRegistrationFile({ baseUrl: cfg.baseUrl, agentAddress: cfg.agentAddress, agentId: opts.agentId })),
  );

  // Paid report endpoint lands with the x402 milestone. Until then it says so plainly.
  app.get("/v1/report", (c) => c.json({ error: "not_live_yet", detail: "The paid report endpoint is not live yet." }, 501));

  app.get("/", (c) =>
    c.html(
      `<!doctype html><meta charset="utf-8"><title>celovouch</title>` +
        `<h1>celovouch</h1><p>Should I pay this agent? A paid x402 trust check for agents on Celo.</p>` +
        `<p>Skeleton build. Try <a href="/v1/sample">/v1/sample</a>.</p>`,
    ),
  );

  return app;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!)) {
  const cfg = loadPublicConfig();
  const agentId = process.env.AGENT_ID ? Number(process.env.AGENT_ID) : undefined;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) console.warn("DATABASE_URL not set: using an in-memory ledger that is lost on restart. Fine for local runs only.");
  const ledger = dbUrl ? await PgLedger.connect(dbUrl) : new MemoryLedger();
  serve({ fetch: createApp(cfg, { agentId, ledger }).fetch, port: cfg.port }, (i) => console.log(`celovouch listening on :${i.port}`));
}
