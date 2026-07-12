import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonError } from "./responses";

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("API error responses", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sanitizes production error details and secret-looking content", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = jsonError("Unable to complete the request", {
      error: new Error(
        "LLM API error: bearer sk-live-secret phone +6591234567 SUPABASE_SERVICE_ROLE_KEY"
      ),
      status: 500,
    });
    const json = await bodyOf(response);

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Unable to complete the request" });
    expect(JSON.stringify(json)).not.toContain("sk-live-secret");
    expect(JSON.stringify(json)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(json)).not.toContain("+6591234567");
  });

  it("keeps development details useful but redacted", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const response = jsonError("Unable to complete the request", {
      error: new Error("Failed with token abc123 and phone +6591234567"),
      status: 500,
    });
    const json = await bodyOf(response);

    expect(json.error).toBe("Unable to complete the request");
    expect(String(json.detail)).toContain("Failed with token [redacted]");
    expect(String(json.detail)).toContain("[phone]");
  });
});
