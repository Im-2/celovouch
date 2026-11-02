import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { acceptsFor, toBaseUnits } from "../src/tokens.js";

const AGENT = "0x03EBE0eff969718958f54cc2e10FA21784D70fC3" as const;
const cfg = { port: 0, baseUrl: "https://celovouch.example", agentAddress: AGENT };

describe("skeleton endpoints", () => {
  const app = createApp(cfg);

  it("serves /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("serves a clearly labelled sample", async () => {
    const body = (await (await app.request("/v1/sample")).json()) as { sample: boolean };
    expect(body.sample).toBe(true);
  });

  it("serves a registration-v1 file with x402Support and no registrations before registering", async () => {
    const body = (await (await app.request("/.well-known/agent-registration.json")).json()) as Record<string, unknown>;
    expect(body.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    expect(body.x402Support).toBe(true);
    expect(body.registrations).toEqual([]);
  });

  it("adds the registration entry once an agent id is known", async () => {
    const body = (await (await createApp(cfg, { agentId: 7 }).request("/.well-known/agent-registration.json")).json()) as {
      registrations: { agentId: number }[];
    };
    expect(body.registrations[0]?.agentId).toBe(7);
  });

  it("does not pretend the paid endpoint is live", async () => {
    expect((await app.request("/v1/report?wallet=0x0")).status).toBe(501);
  });
});

describe("x402 accepts", () => {
  it("converts prices to base units", () => {
    expect(toBaseUnits("0.03")).toBe("30000");
    expect(toBaseUnits("1")).toBe("1000000");
  });

  it("uses explicit amount/asset/extra for every token, including USA₮", () => {
    const accepts = acceptsFor({ price: "0.03", payTo: AGENT });
    expect(accepts).toHaveLength(3);
    for (const a of accepts) {
      expect(a.network).toBe("eip155:42220");
      expect(a.price.amount).toBe("30000");
      expect(a.price.asset).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
    expect(accepts.find((a) => a.price.extra.name === "Tether America USD")).toBeDefined();
  });
});
