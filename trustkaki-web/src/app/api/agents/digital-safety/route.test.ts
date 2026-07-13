import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const requireAuthMock = vi.fn();
const canAccessSeniorMock = vi.fn();
const loadContextMock = vi.fn();
const runDigitalSafetyAgentMock = vi.fn();
const seniorId = "00000000-0000-4000-8000-000000000001";
const auth = { userId: "user-1", accessibleSeniorIds: [seniorId] };
const context = { senior: { name: "Mr Tan" }, messages: [], currentRiskLevel: "green" };

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthMock,
  canAccessSenior: canAccessSeniorMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadAuthorizedAgentContext: loadContextMock,
}));
vi.mock("@/lib/agents/orchestrator", () => ({
  runDigitalSafetyAgent: runDigitalSafetyAgentMock,
}));
vi.mock("@/lib/agents/provider", () => ({
  getLLMProvider: () => ({ isConfigured: true, getModel: () => "test-model" }),
}));

const request = () => new Request("http://localhost/api/agents/digital-safety", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ seniorId, message: "Someone sent me a payment link." }),
}) as NextRequest;

describe("/api/agents/digital-safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ ok: true, auth, accessToken: "verified-access-token" });
    canAccessSeniorMock.mockReturnValue(true);
    loadContextMock.mockResolvedValue(context);
    runDigitalSafetyAgentMock.mockResolvedValue({ data: { isScam: true } });
  });

  it("returns 401 before model work", async () => {
    requireAuthMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(401);
    expect(runDigitalSafetyAgentMock).not.toHaveBeenCalled();
  });

  it("returns 403 before loading context or model work", async () => {
    canAccessSeniorMock.mockReturnValue(false);
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(403);
    expect(loadContextMock).not.toHaveBeenCalled();
    expect(runDigitalSafetyAgentMock).not.toHaveBeenCalled();
  });

  it("runs against authorized server context without leaking the token", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());
    const json = await response.json();
    expect(loadContextMock).toHaveBeenCalledWith({ auth, seniorId });
    expect(runDigitalSafetyAgentMock).toHaveBeenCalledWith(
      "Someone sent me a payment link.",
      context
    );
    expect(JSON.stringify(json)).not.toContain("verified-access-token");
  });
});
