import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AgentRunContext } from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const requireAuthenticatedCaregiverMock = vi.fn();
const canAccessSeniorMock = vi.fn();
const loadAuthorizedAgentContextMock = vi.fn();
const orchestrateMock = vi.fn();
const persistOrchestrationResultMock = vi.fn();

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
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
    expect(loadAuthorizedAgentContextMock).toHaveBeenCalledWith({ auth, seniorId });
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
});
