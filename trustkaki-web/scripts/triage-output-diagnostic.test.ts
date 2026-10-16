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
