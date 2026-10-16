import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { socialIntentCases } from "../src/lib/agents/evaluation/socialIntent";
import { runSocialIntentPilot } from "./social-intent-live";

const directories: string[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "social-intent-test-"));
  directories.push(directory);
  return { directory, approvedCapUsd: 1, openrouterKey: "fake-router", openaiKey: "fake-openai" };
}
afterEach(() => { directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); vi.restoreAllMocks(); });

describe("isolated social-intent live runner", () => {
  it("rejects missing cap or key before sending anything", async () => {
    const request = vi.fn();
    await expect(runSocialIntentPilot({ ...setup(), approvedCapUsd: 0, request })).rejects.toThrow("approval_or_keys_missing");
    await expect(runSocialIntentPilot({ ...setup(), openrouterKey: "", request })).rejects.toThrow("approval_or_keys_missing");
    expect(request).not.toHaveBeenCalled();
  });

  it("reserves before a failed call and blocks subsequent attempts without retrying", async () => {
    const options = setup();
    const request = vi.fn(async () => {
      const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
      expect(ledger.calls).toBe(1);
      expect(ledger.reservedMicroUsd).toBe(11011);
      expect(ledger.inFlight).toMatch(/^jev:/);
      return new Response("secret provider failure", { status: 429 });
    });
    await expect(runSocialIntentPilot({ ...options, request })).rejects.toThrow("social_intent_stopped_at_jev:");
    await expect(runSocialIntentPilot({ ...options, request })).rejects.toThrow("ledger_requires_review");
    expect(request).toHaveBeenCalledTimes(1);
    const saved = readFileSync(join(options.directory, "budget.json"), "utf8");
    expect(JSON.parse(saved).stopped).toBe(true);
    expect(JSON.parse(saved).failureCode).toBe("provider_http_429");
    expect(saved).not.toContain("secret");
  });

  it("blocks concurrent runs", async () => {
    const options = setup();
    writeFileSync(join(options.directory, "run.lock"), "");
    const request = vi.fn();
    await expect(runSocialIntentPilot({ ...options, request })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects recovery outside the exact reviewed failure", async () => {
    const request = vi.fn();
    await expect(runSocialIntentPilot({ ...setup(), approvedFormatRecovery: true, request })).rejects.toThrow("recovery_scope_mismatch");
    expect(request).not.toHaveBeenCalled();
  });

  it("completes 72 mocked calls, isolates credentials, reports languages and never repeats completed calls", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const options = setup();
    const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      const isJev = String(url) === "https://openrouter.ai/api/v1/systemone";
      const message = isJev ? body.state.current_message : JSON.parse(body.messages[1].content).current_message;
      const item = socialIntentCases.find(c => c.message === message)!;
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer " + (isJev ? options.openrouterKey : options.openaiKey));
      expect(init!.redirect).toBe("error");
      if (!isJev) expect(body.messages.some((m: { content: string }) => /json/i.test(m.content))).toBe(true);
      expect(String(url)).toBe(isJev ? "https://openrouter.ai/api/v1/systemone" : "https://api.openai.com/v1/chat/completions");
      return Response.json(isJev ? {
        model: "typesafe/jev-1.14", answers: { social_intent: { type: "choice", choice: item.expected, confidence: 1,
          probabilities: { interested: +(item.expected === "interested"), declining: +(item.expected === "declining"), unclear: +(item.expected === "unclear") } } },
        usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
      } : { model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content: JSON.stringify({ label: item.expected }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 10 } });
    });
    const report = await runSocialIntentPilot({ ...options, request });
    expect(report.calls).toBe(72);
    expect(report.reservedUsd).toBeLessThan(1);
    expect(report.summaries).toHaveLength(4);
    report.summaries.forEach(s => { expect(s.correct).toBe(18); expect(s.byLanguage.map(l => l.total)).toEqual([6, 6, 6]); });
    await runSocialIntentPilot({ ...options, request });
    expect(request).toHaveBeenCalledTimes(72);
    const observations = readFileSync(join(options.directory, "observations.jsonl"), "utf8");
    expect(observations).not.toContain("fake-");
    expect(observations).not.toContain("current_message");

    // Replay the exact approved stopped state; completed Jev must not be billed again.
    const recoveryDirectory = setup().directory;
    writeFileSync(join(recoveryDirectory, "observations.jsonl"), observations.split("\n")[0] + "\n");
    writeFileSync(join(recoveryDirectory, "budget.json"), JSON.stringify({ capMicroUsd: 1000000, reservedMicroUsd: 11563, calls: 2,
      datasetSha256: report.datasetSha256, inFlight: "openai:social_intent_1_1", stopped: true, jevModel: "typesafe/jev-1.14" }));
    request.mockClear();
    const recovery = { ...options, directory: recoveryDirectory, request, approvedFormatRecovery: true };
    const recovered = await runSocialIntentPilot(recovery);
    expect(request).toHaveBeenCalledTimes(71);
    expect(recovered.calls).toBe(73);
    expect(recovered.successfulCalls).toBe(72);
    expect(recovered.reviewedFailure?.key).toBe("openai:social_intent_1_1");
    expect(recovered.reservedUsd).toBeGreaterThan(report.reservedUsd);
    expect(recovered.reservedUsd).toBeLessThan(1);
    expect(JSON.parse(readFileSync(join(recoveryDirectory, "before-approved-format-recovery.json"), "utf8")).reservedMicroUsd).toBe(11563);
    await runSocialIntentPilot(recovery);
    expect(request).toHaveBeenCalledTimes(71);
  });
});
