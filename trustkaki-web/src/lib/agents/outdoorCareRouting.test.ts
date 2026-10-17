import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentRunContext, TriageOutput } from "./contracts";
import { routingFlags } from "./routingContract";

const mocks = vi.hoisted(() => ({ runAgent: vi.fn(), environment: vi.fn() }));
vi.mock("./runner", () => ({ runAgent: mocks.runAgent, toAgentTrace: (run: Record<string, unknown>) => ({ ...run, id: run.traceId }) }));
vi.mock("./environmentAdvisory", async importOriginal => ({
  ...await importOriginal<typeof import("./environmentAdvisory")>(), environmentAdvisory: mocks.environment,
}));
const ctx: AgentRunContext = {
  senior: { name: "Mr Tan", age: 76, livingSituation: "Lives alone", caregiver: "Rachel", aacVolunteer: "Mei Ling" },
  messages: [], currentRiskLevel: "yellow",
};
const advisory = { reply: "Bedok: Thundery Showers. Source: data.gov.sg / NEA.", trace: {
  id: "environment", agentId: "aac_nudge", agentName: "Outdoor Conditions Tool", timestamp: new Date().toISOString(),
  input: "", reasoning: "Government data", output: "{}", tags: ["reply_selected"],
} };
function arrange(type?: "health" | "daily_living", healthLabel = "absent", outdoorContext: TriageOutput["outdoorContext"] = "check") {
  vi.stubEnv("TRUSTKAKI_JEV_ROUTING_ENABLED", "true");
  vi.stubEnv("TRUSTKAKI_JEV_ENABLED", "false");
  vi.stubEnv("OPENROUTER_API_KEY", "fictional-key");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0 },
    answers: Object.fromEntries(routingFlags.map(flag => {
      const choice = flag === "health" ? healthLabel : "absent";
      return [flag, { type: "choice", choice, confidence: 1, probabilities: { present: +(choice === "present"), absent: +(choice === "absent"), unclear: +(choice === "unclear") } }];
    })),
  })));
  const triage: TriageOutput = {
    outdoorContext,
    signals: type ? [{ type, severity: "low", description: "Known knee discomfort; reminder to rest" }] : [],
    riskLevel: "yellow", riskChange: "none", routing: [], summary: "Walking plan with existing care context",
    responseMessage: "If your knee gets uncomfortable, please rest.", humanFollowUpRequired: false,
  };
  mocks.runAgent.mockImplementation(async options => ({
    agentId: options.agentId, agentName: options.agentName, traceId: options.agentId,
    timestamp: new Date().toISOString(), input: "", reasoning: "", output: "{}", tags: [],
    data: options.agentId === "triage" ? triage : options.fallback(),
    durationMs: 0, modelUsed: "offline fixture", fallback: false, inputSummary: "", outputSummary: "", stateChanges: [],
  }));
  mocks.environment.mockResolvedValue(structuredClone(advisory));
}
beforeEach(() => { mocks.runAgent.mockReset(); mocks.environment.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(["health", "daily_living"] as const)("keeps %s context and still calls the outdoor tool for the screenshot message", async type => {
  arrange(type);
  const { orchestrate } = await import("./orchestrator");
  const result = await orchestrate("i am going for a walk in bedok", ctx);
  expect(mocks.environment).toHaveBeenCalledWith("i am going for a walk in bedok", undefined);
  expect(result.messages[0].text).toContain("If your knee gets uncomfortable, please rest.");
  expect(result.messages[0].text).toContain("Bedok: Thundery Showers");
  expect(result.riskLevel).toBe("yellow");
  expect(result.briefing).not.toBeNull();
  expect(result.traces.some(trace => trace.agentName === "Outdoor Conditions Tool")).toBe(true);
  const routing = JSON.parse(result.traces.find(trace => trace.agentName === "Jev Specialist Router")!.output);
  expect(routing.executedSpecialists).toContain("aac_nudge");
});
it("allows factual outdoor advice during a nonurgent Jev care pause while keeping the care clarification", async () => {
  arrange(undefined, "unclear");
  const { orchestrate } = await import("./orchestrator");
  const result = await orchestrate("i am going for a walk in bedok", ctx);
  expect(mocks.environment).toHaveBeenCalledTimes(1);
  expect(result.messages[0].text).toContain("what help do you need right now");
  expect(result.messages[0].text).toContain("Bedok: Thundery Showers");
});
it.each(["I have chest pain and cannot breathe. Going for a walk in Bedok.", "Going for a walk in Bedok; a caller wants my bank OTP."])("does not displace emergency or scam handling: %s", async message => {
  arrange("health");
  const { orchestrate } = await import("./orchestrator");
  const result = await orchestrate(message, ctx);
  expect(mocks.environment).not.toHaveBeenCalled();
  expect(result.messages[0].text).not.toContain("Bedok: Thundery Showers");
});
it("does not displace red-risk handling", async () => {
  arrange("health");
  const { orchestrate } = await import("./orchestrator");
  await orchestrate("Going for a walk in Bedok", { ...ctx, currentRiskLevel: "red" });
  expect(mocks.environment).not.toHaveBeenCalled();
});
it("does not call the tool after refusing the walk", async () => {
  arrange(undefined, "absent", "declined");
  const { orchestrate } = await import("./orchestrator");
  await orchestrate("I don't want to walk in Bedok", ctx);
  expect(mocks.environment).not.toHaveBeenCalled();
});


it.each([
  ["I plan to practise tai chi by the reservoir", "check", true],
  ["I will play sepak takraw at the open court", "check", true],
  ["I am cycling indoors on a stationary bike", "none", false],
  ["I cancelled my fishing trip", "declined", false],
] as const)("uses semantic outdoor intent for %s", async (message, intent, expected) => {
  arrange(undefined, "absent", intent);
  const { orchestrate } = await import("./orchestrator");
  await orchestrate(message, ctx);
  expect(mocks.environment).toHaveBeenCalledTimes(expected ? 1 : 0);
});
