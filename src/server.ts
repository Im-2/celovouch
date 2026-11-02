import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadPublicConfig, type PublicConfig } from "./config.js";
import { buildRegistrationFile } from "./registration.js";
import { SAMPLE_REPORT } from "./sample.js";

export function createApp(cfg: PublicConfig, opts: { agentId?: number } = {}) {
  const app = new Hono();

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
  serve({ fetch: createApp(cfg, { agentId }).fetch, port: cfg.port }, (i) => console.log(`celovouch listening on :${i.port}`));
}
