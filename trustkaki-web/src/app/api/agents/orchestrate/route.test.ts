import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AgentRunContext } from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const requireAuthenticatedCaregiverMock = vi.fn();
const canAccessSeniorMock = vi.fn();
const loadAuthorizedAgentContextMock = vi.fn();
const orchestrateMock = vi.fn();
const persistOrchestrationResultMock = vi.fn();

const receipts = new Map<string, {state: string; message: string; payload?: unknown}>();
const webRequestReceiptMock = vi.fn(async (identity: {clientMessageId:string; message:string}, action: string, payload?: unknown) => {
  const current = receipts.get(identity.clientMessageId);
  if (current && current.message !== identity.message) return {status:"conflict"};
  if (action === "claim") {
    if (!current) { receipts.set(identity.clientMessageId,{state:"processing",message:identity.message}); return {status:"run"}; }
    if (current.state === "completed") return {status:"replay",payload:current.payload};
    if (current.state === "retryable") {current.state="persisting";return {status:"resume",payload:current.payload};}
    return {status:"busy"};
  }
  if (current?.state === "completed" && action === "release") throw new Error("Invalid receipt transition");
  if (action === "cancel") receipts.delete(identity.clientMessageId);
  else if (current) {current.state=action === "complete" ? "completed" : action === "release" ? "retryable" : "persisting"; if (payload) current.payload=payload;}
  return {status:"saved"};
});
vi.mock("@/lib/persistence/webRequestReceipt", () => ({ webRequestReceipt:webRequestReceiptMock }));
vi.mock("@/lib/persistence/orchestration", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/persistence/orchestration")>(),
  serializeOrchestrationRetryEnvelope: (value: unknown) => value,
  restoreOrchestrationRetryEnvelope: (value: unknown) => value,
}));

const seniorId = "00000000-0000-4000-8000-000000000001";
const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "caregiver",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: [seniorId],
};
const context: AgentRunContext = {
  senior: {
    name: "Mr Tan Ah Hock",
    age: 78,
    livingSituation: "Lives alone",
    caregiver: "Rachel Tan",
    aacVolunteer: "Mei Ling",
  },
  messages: [],
  currentRiskLevel: "yellow",
};

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthenticatedCaregiverMock,
  canAccessSenior: canAccessSeniorMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadAuthorizedAgentContext: loadAuthorizedAgentContextMock,
}));
vi.mock("@/lib/agents/orchestrator", () => ({ orchestrate: orchestrateMock }));
vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  persistOrchestrationResult: persistOrchestrationResultMock,
}));
vi.mock("@/lib/agents/provider", () => ({
  getLLMProvider: () => ({ isConfigured: true, getModel: () => "test-model" }),
}));

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/agents/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("/api/agents/orchestrate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    receipts.clear();
    requireAuthenticatedCaregiverMock.mockResolvedValue({
      ok: true,
      auth,
      accessToken: "verified-access-token",
    });
    canAccessSeniorMock.mockReturnValue(true);
    loadAuthorizedAgentContextMock.mockResolvedValue(context);
    orchestrateMock.mockResolvedValue({ messages: [], riskLevel: "yellow" });
    persistOrchestrationResultMock.mockResolvedValue({ persisted: true });
  });

  it.each(["caregiver", "demo_admin"])("restricts live traces by role (%s)", async role => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({ ok: true, auth: { ...auth, role } });
    orchestrateMock.mockResolvedValue({ messages: [{ text: "Hello" }], riskLevel: "yellow", traces: [{ input: "private context", reasoning: "internal reasoning" }] });
    const { POST } = await import("./route");
    const response = await POST(request({ seniorId, message: "Hello" }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.messages).toEqual([{ text: "Hello" }]);
    expect(json.traces).toEqual(role === "demo_admin" ? [{ input: "private context", reasoning: "internal reasoning" }] : []);
  });

  it.each(["demo_admin", "caregiver"])("exposes request retrieval only to demo admin (%s)", async role => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({ ok: true, auth: { ...auth, role } });
    const { POST } = await import("./route");
    const response = await POST(request({ seniorId, message: "Hello" }));
    const json = await response.json();
    if (role === "demo_admin") expect(json.retrieval).toEqual({ status: "not_recorded", items: [] });
    else expect(json).not.toHaveProperty("retrieval");
  });

  it("returns 401 before loading context or running models", async () => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { POST } = await import("./route");

    const response = await POST(request({ seniorId, message: "Hello" }));

    expect(response.status).toBe(401);
    expect(loadAuthorizedAgentContextMock).not.toHaveBeenCalled();
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("returns 403 before model or persistence work for an inaccessible senior", async () => {
    canAccessSeniorMock.mockReturnValue(false);
    const { POST } = await import("./route");

    const response = await POST(request({ seniorId, message: "Hello" }));

    expect(response.status).toBe(403);
    expect(loadAuthorizedAgentContextMock).not.toHaveBeenCalled();
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
  });

  it("appends the inbound message to authorized server context without leaking the token", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      request({ seniorId, message: "Not hungry today.", clientMessageId: "web-1" })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(loadAuthorizedAgentContextMock).toHaveBeenCalledWith({ auth, seniorId, query: 'Not hungry today.' });
    expect(orchestrateMock).toHaveBeenCalledWith(
      "Not hungry today.",
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            id: "web-1",
            sender: "senior",
            text: "Not hungry today.",
          }),
        ],
      })
    );
    expect(persistOrchestrationResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        seniorId,
        message: "Not hungry today.",
        clientMessageId: "web-1",
      })
    );
    expect(JSON.stringify(json)).not.toContain("verified-access-token");
  });

  it.each([
    ["context", loadAuthorizedAgentContextMock, "unknown"],
    ["orchestration", orchestrateMock, "unknown"],
    ["persistence", persistOrchestrationResultMock, "bind orchestration persistence"],
  ])("logs only fixed diagnostics when %s fails", async (stage, failingCall, operation) => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "PRIVATE_PROVIDER_PAYLOAD_AND_SENIOR_MESSAGE";
    failingCall.mockRejectedValueOnce(new Error(`bind orchestration persistence: ${secret}`));
    const { POST } = await import("./route");

    const response = await POST(request({ seniorId, message: secret }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Orchestration failed" });
    expect(log).toHaveBeenCalledExactlyOnceWith("[TrustKaki:orchestrate] Request failed", {
      stage, kind: "error", operation,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(log.mock.calls)).not.toContain(seniorId);
    expect(JSON.stringify(log.mock.calls)).not.toContain(auth.userId);
  });


  it("never logs an unrecognized raw TypeError or its stack", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "PRIVATE_DETAIL_CANARY";
    persistOrchestrationResultMock.mockRejectedValueOnce(new TypeError(secret));
    const { POST } = await import("./route");

    const response = await POST(request({ seniorId, message: "Hello" }));

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledExactlyOnceWith("[TrustKaki:orchestrate] Request failed", {
      stage: "persistence", kind: "type_error", operation: "unknown",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });

  it("replays a completed request without model, context or persistence work", async () => {
    const {POST} = await import("./route");
    const body = {seniorId,message:"Hello",clientMessageId:"replay-1"};
    const first = await POST(request(body));
    const second = await POST(request(body));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(loadAuthorizedAgentContextMock).toHaveBeenCalledTimes(1);
    expect(persistOrchestrationResultMock).toHaveBeenCalledTimes(1);
  });
  it("blocks concurrent duplicates before model work", async () => {
    let finish!: (value: unknown) => void;
    orchestrateMock.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
    const {POST} = await import("./route");
    const body = {seniorId,message:"Hello",clientMessageId:"concurrent-1"};
    const first = POST(request(body));
    await vi.waitFor(() => expect(orchestrateMock).toHaveBeenCalledTimes(1));
    const second = await POST(request(body));
    expect(second.status).toBe(409);
    finish({messages:[],traces:[],riskLevel:"yellow"});
    expect((await first).status).toBe(200);
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
  });
  it("resumes a partial save with the original model result and context", async () => {
    persistOrchestrationResultMock.mockRejectedValueOnce(new Error("transient save failure"));
    const {POST} = await import("./route");
    const body = {seniorId,message:"Hello",clientMessageId:"partial-1"};
    expect((await POST(request(body))).status).toBe(500);
    const original = persistOrchestrationResultMock.mock.calls[0][0];
    expect((await POST(request(body))).status).toBe(200);
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(loadAuthorizedAgentContextMock).toHaveBeenCalledTimes(1);
    expect(persistOrchestrationResultMock.mock.calls[1][0]).toEqual(original);
  });
  it("rejects an ID reused with changed message text", async () => {
    const {POST} = await import("./route");
    await POST(request({seniorId,message:"Hello",clientMessageId:"conflict-1"}));
    expect((await POST(request({seniorId,message:"Different",clientMessageId:"conflict-1"}))).status).toBe(409);
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
  });

  it.each(["snapshot","complete"])("recovers when the %s acknowledgement is lost", async action => {
    const handler = webRequestReceiptMock.getMockImplementation()!;
    webRequestReceiptMock.mockImplementationOnce(handler).mockImplementationOnce(async (...args) => {
      const result = await handler(...args);
      if (action === "snapshot") throw new Error("lost acknowledgement");
      return result;
    });
    if (action === "complete") webRequestReceiptMock.mockImplementationOnce(() => {throw new Error("completion unavailable");});
    const {POST} = await import("./route");
    const body = {seniorId,message:"Hello",clientMessageId:`lost-${action}`};
    expect((await POST(request(body))).status).toBe(500);
    expect((await POST(request(body))).status).toBe(200);
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
  });

  it("rechecks current role before returning a stored response", async () => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({ok:true,auth:{...auth,role:"demo_admin"}});
    orchestrateMock.mockResolvedValue({messages:[],riskLevel:"yellow",traces:[{input:"private trace"}]});
    const {POST} = await import("./route");
    const body = {seniorId,message:"Hello",clientMessageId:"role-replay"};
    await POST(request(body));
    requireAuthenticatedCaregiverMock.mockResolvedValue({ok:true,auth});
    const response = await POST(request(body));
    expect(await response.json()).toMatchObject({traces:[]});
    const again = await POST(request(body));
    expect(await again.json()).not.toHaveProperty("retrieval");
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
  });
  it("replays after completion committed but its acknowledgement was lost", async () => {
    const handler = webRequestReceiptMock.getMockImplementation()!;
    webRequestReceiptMock.mockImplementationOnce(handler).mockImplementationOnce(handler).mockImplementationOnce(async (...args) => {
      await handler(...args); throw new Error("lost committed completion acknowledgement");
    });
    const {POST} = await import("./route");
    const body = {seniorId,message:"Hello",clientMessageId:"complete-lost-after-commit"};
    expect((await POST(request(body))).status).toBe(500);
    expect((await POST(request(body))).status).toBe(200);
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(persistOrchestrationResultMock).toHaveBeenCalledTimes(1);
  });

});
