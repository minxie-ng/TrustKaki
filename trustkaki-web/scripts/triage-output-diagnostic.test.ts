import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { diagnoseTriage } from "./triage-output-diagnostic";

let directory: string;
const original = '{"capMicroUsd":1000000,"reservedMicroUsd":4448,"calls":2,"protocolHash":"4204a626c03fb51c614c6ed311164bd44007e72906dae563dd6e5c56fb3e422d","stopped":true,"failureCode":"agent_schema","inFlight":[2],"completedFlows":0,"finished":false,"jevModel":null}';
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tk-triage-diagnostic-"));
  writeFileSync(join(directory, "budget.json"), original);
  vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "fictional-private-key");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

it("reserves before its sole request, preserves the source, and keeps only safe schema details", async () => {
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const reserved = JSON.parse(readFileSync(join(directory, "triage-diagnostic.json"), "utf8"));
    expect(reserved.calls).toBe(3); expect(reserved.reservedMicroUsd).toBeGreaterThan(4448);
    expect(url).toBe("https://api.openai.com/v1/chat/completions"); expect(init?.redirect).toBe("error");
    return Response.json({ model: "gpt-4o-mini-2024-07-18", usage: { prompt_tokens: 100, completion_tokens: 50 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ signals: [{ type: "PRIVATE_VALUE" }] }) } }] });
  });
  const result = await diagnoseTriage({ directory, approved: true, request });
  expect(result.status).toBe("agent_schema");
  expect(result.issues).toContainEqual({ code: "invalid_value", path: ["signals", 0, "type"] });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_VALUE|fictional-private-key/);
  expect(readFileSync(join(directory, "budget.json"), "utf8")).toBe(original);
  await expect(diagnoseTriage({ directory, approved: true, request })).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});

it("refuses missing approval and changed ledgers before any network call", async () => {
  const request = vi.fn<typeof fetch>();
  await expect(diagnoseTriage({ directory, approved: false, request })).rejects.toThrow();
  writeFileSync(join(directory, "budget.json"), original + " ");
  await expect(diagnoseTriage({ directory, approved: true, request })).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

it("retains reservations and never retries transport failures", async () => {
  const request = vi.fn<typeof fetch>(async () => { throw new Error("private transport error"); });
  const result = await diagnoseTriage({ directory, approved: true, request });
  expect(result.status).toBe("transport"); expect(result.reservedMicroUsd).toBeGreaterThan(4448);
  await expect(diagnoseTriage({ directory, approved: true, request })).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain("private transport error");
});


it.each([false, true])("diagnoses Jev with its own key, retained budget and safe issues (invalid=%s)", async invalid => {
  vi.stubEnv("OPENROUTER_API_KEY", "fictional-router-key");
  const stopped = '{"capMicroUsd":1000000,"reservedMicroUsd":47590,"calls":15,"protocolHash":"6df05a47f8e2692a33d77621ef03f04ef74128d453fef7c354539714deeaefc1","stopped":true,"failureCode":"jev_schema","inFlight":[14],"completedFlows":3,"finished":false,"jevModel":"typesafe/jev-1.14-20261014"}';
  writeFileSync(join(directory, "budget.json"), stopped);
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer fictional-router-key" });
    const report = JSON.parse(readFileSync(join(directory, "jev-diagnostic.json"), "utf8"));
    expect(report.calls).toBe(16); expect(report.reservedMicroUsd).toBe(58601);
    const body = JSON.parse(init!.body as string);
    expect(body.state.current_message).toContain("lunch never eat");
    return Response.json({ model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
      answers: Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: "choice", choice: "absent", confidence: 1,
        probabilities: { present: invalid && key === "daily_living" ? 0.5 : 0, absent: 1, unclear: 0 } }])) });
  });
  const result = await diagnoseTriage({ directory, approved: true, jev: true, request });
  expect(result.schemaValid).toBe(!invalid);
  if (invalid) expect(result.issues).toContainEqual({ code: "custom", path: ["answers", "daily_living", "probabilities"] });
  expect(readFileSync(join(directory, "budget.json"), "utf8")).toBe(stopped);
  expect(JSON.stringify(result)).not.toContain("fictional-router-key");
  await expect(diagnoseTriage({ directory, approved: true, jev: true, request })).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});
