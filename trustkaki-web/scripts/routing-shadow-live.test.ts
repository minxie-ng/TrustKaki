import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routingFlags } from "../src/lib/agents/evaluation/routingShadow";
import { routingShadowCases } from "../src/lib/agents/evaluation/routingShadowCases";
import { TRIAGE_PROMPT, triageUserPrompt } from "../src/lib/agents/prompts";
import { routingTriageRequest, runRoutingShadow } from "./routing-shadow-live";

const directories: string[] = [];
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "tk-routing-test-")); directories.push(directory);
  return { directory, approvedCapUsd: 1, pricesVerified: true, openrouterKey: "fictional-router-test", openaiKey: "fictional-openai-test" };
};
afterEach(() => directories.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })));
const jevResponse = () => ({ model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
  answers: Object.fromEntries(routingFlags.map(flag => [flag, { type: "choice", choice: "absent", confidence: 1,
    probabilities: { present: 0, absent: 1, unclear: 0 } }])) });
const triageResponse = () => ({ model: "gpt-4o-mini-2024-07-18", usage: { prompt_tokens: 100, completion_tokens: 100 },
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ signals: [], riskLevel: "green", riskChange: "none",
    routing: [], summary: "Fictional summary", responseMessage: "Fictional response", humanFollowUpRequired: false }) } }] });

describe("routing shadow live runner (all transport mocked)", () => {
  it("preserves the real Triage prompt and input formatter, including supplied personal context", () => {
    const item = routingShadowCases.find(c => c.family === "09")!;
    const body = routingTriageRequest(item);
    expect(body.messages).toEqual([{ role: "system", content: TRIAGE_PROMPT }, { role: "user", content: triageUserPrompt(item.message, item.context) }]);
    expect(body.max_tokens).toBe(1024);
  });

  it("refuses missing approval, current price verification or keys without requests", async () => {
    const options = setup(), request = vi.fn<typeof fetch>();
    await expect(runRoutingShadow({ ...options, request, approvedCapUsd: 0 })).rejects.toThrow();
    await expect(runRoutingShadow({ ...options, request, pricesVerified: false })).rejects.toThrow();
    await expect(runRoutingShadow({ ...options, request, openrouterKey: "" })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("reserves before each call, routes credentials exactly, completes 72 attempts and never reruns completed pairs", async () => {
    const options = setup();
    let calls = 0;
    const request = vi.fn<typeof fetch>(async (url, init) => {
      calls++;
      const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
      expect(ledger.calls).toBe(calls); expect(ledger.inFlight).not.toBeNull();
      expect(ledger.reservedMicroUsd).toBeGreaterThan(0); expect(ledger.reservedMicroUsd).toBeLessThanOrEqual(1_000_000);
      const jev = url === "https://openrouter.ai/api/v1/systemone";
      expect(jev || url === "https://api.openai.com/v1/chat/completions").toBe(true);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer " + (jev ? options.openrouterKey : options.openaiKey) });
      expect(init?.redirect).toBe("error");
      return Response.json(jev ? jevResponse() : triageResponse());
    });
    const report = await runRoutingShadow({ ...options, request });
    expect(report.calls).toBe(72); expect(report.plannedReservationUsd).toBeLessThanOrEqual(1);
    expect(report.summaries.jev.overall.cases).toBe(36);
    expect(report.summaries.triage.bySplit.held_out.semanticFamilies).toBe(6);
    await runRoutingShadow({ ...options, request });
    expect(request).toHaveBeenCalledTimes(72);
  });

  it("keeps a failed-call reservation and refuses continuation without retry", async () => {
    const options = setup(), request = vi.fn<typeof fetch>(async () => Response.json({ secret: "must never be logged" }, { status: 503 }));
    await expect(runRoutingShadow({ ...options, request })).rejects.toThrow("routing_shadow_stopped_at_jev:routing_01_1");
    const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
    expect(ledger).toMatchObject({ calls: 1, stopped: true, inFlight: "jev:routing_01_1" });
    expect(ledger.reservedMicroUsd).toBe(11011);
    expect(JSON.parse(readFileSync(join(options.directory, "last-failure.json"), "utf8"))).toEqual({
      key: "jev:routing_01_1", stage: "http", httpStatus: 503, errorKind: "Error",
    });
    await expect(runRoutingShadow({ ...options, request })).rejects.toThrow("routing_shadow_ledger_requires_review");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops on invalid or unpriced provider results rather than treating failure as an absent concern", async () => {
    const options = setup(), response = jevResponse(); response.usage.cost = 2;
    const request = vi.fn<typeof fetch>(async () => Response.json(response));
    await expect(runRoutingShadow({ ...options, request })).rejects.toThrow("routing_shadow_stopped");
    expect(request).toHaveBeenCalledTimes(1);
    const second = setup();
    const malformed = vi.fn<typeof fetch>(async () => Response.json({ model: "unverified" }));
    await expect(runRoutingShadow({ ...second, request: malformed })).rejects.toThrow("routing_shadow_stopped");
    expect(malformed).toHaveBeenCalledTimes(1);
  });

  it("permits exactly the approved initial recovery, preserving its reservation and stopping on another error", async () => {
    const options = setup(), failed = vi.fn<typeof fetch>(async () => { throw new Error("DNS failure"); });
    await expect(runRoutingShadow({ ...options, request: failed })).rejects.toThrow();
    const request = vi.fn<typeof fetch>(async url => Response.json(String(url).includes("systemone") ? jevResponse() : triageResponse()));
    const report = await runRoutingShadow({ ...options, request, approvedDnsRetry: true });
    expect(report.calls).toBe(73);
    expect(report.reservedUsd).toBeCloseTo(report.plannedReservationUsd + 0.011011, 6);
    expect(JSON.parse(readFileSync(join(options.directory, "initial-dns-failure.json"), "utf8")).stopped).toBe(true);
    await runRoutingShadow({ ...options, request, approvedDnsRetry: true });
    expect(request).toHaveBeenCalledTimes(72);
    const second = setup();
    await expect(runRoutingShadow({ ...second, request: failed })).rejects.toThrow();
    await expect(runRoutingShadow({ ...second, request: failed, approvedDnsRetry: true })).rejects.toThrow();
    const count = failed.mock.calls.length;
    await expect(runRoutingShadow({ ...second, request: failed, approvedDnsRetry: true })).rejects.toThrow();
    expect(failed).toHaveBeenCalledTimes(count);
  });

  it("rejects the historical 30-pair recovery after prompt changes alter its approved reservation", async () => {
    const options = setup();
    const failure = vi.fn<typeof fetch>(async () => { throw new Error("failure"); });
    await expect(runRoutingShadow({ ...options, request: failure })).rejects.toThrow();
    let calls = 0;
    const partial = vi.fn<typeof fetch>(async url => {
      if (++calls === 61) throw new Error("failure");
      return Response.json(String(url).includes("systemone") ? jevResponse() : triageResponse());
    });
    await expect(runRoutingShadow({ ...options, request: partial, approvedDnsRetry: true })).rejects.toThrow();
    const request = vi.fn<typeof fetch>(async url => Response.json(String(url).includes("systemone") ? jevResponse() : triageResponse()));
    const before = readFileSync(join(options.directory, "budget.json"), "utf8");
    // The completed historical experiment used 415967 microUSD at this stop.
    // New prompts must not silently inherit that narrowly approved recovery.
    expect(JSON.parse(before).reservedMicroUsd).not.toBe(415967);
    await expect(runRoutingShadow({ ...options, request, approvedRemainingRetry: true }))
      .rejects.toThrow("routing_shadow_remaining_retry_state_mismatch");
    expect(request).not.toHaveBeenCalled();
    expect(readFileSync(join(options.directory, "budget.json"), "utf8")).toBe(before);
  });
});
