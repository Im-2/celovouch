/**
 * A fixed example report so buyers can see the output shape before paying.
 * It describes a made-up agent. It is not a score about any real agent.
 */
export const SAMPLE_REPORT = {
  sample: true,
  note: "Fixed example about a fictional agent. Not a real score.",
  subject: { kind: "agentId", value: "example-0" },
  verdict: "caution",
  score: 58,
  signals: [
    { id: "registration_reachable", result: "pass", detail: "Registration file loads and lists a payTo wallet." },
    { id: "payto_matches_agent_wallet", result: "pass", detail: "The 402 payTo equals the registered agent wallet." },
    { id: "distinct_payers", result: "warn", detail: "3 distinct payers; the top payer is 80% of volume." },
    { id: "independent_payers", result: "warn", detail: "1 of 3 payers meets the hackathon definition of independent." },
    { id: "circular_flow", result: "pass", detail: "No funds returned to payers." },
  ],
  evidence: [{ label: "example", url: "https://example.invalid/evidence" }],
  summary: "Example only. The agent looks live, but most of its volume comes from one payer.",
  generatedBy: "celovouch",
};
