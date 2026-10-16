import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runJevSocialDecision, hasSocialActivityCue } from "./socialDecision";

function response(choice = "declining", model = "typesafe/jev-1.14-20261014") {
  return { model, usage: { input_tokens: 500, output_tokens: 0 }, answers: { social_intent: {
    type: "choice", choice, confidence: 0.9,
    probabilities: { interested: +(choice === "interested"), declining: +(choice === "declining"), unclear: +(choice === "unclear") },
  } } };
}
beforeEach(() => { vi.stubEnv("TRUSTKAKI_JEV_ENABLED", "true"); vi.stubEnv("OPENROUTER_API_KEY", "test-key"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Jev social decision", () => {
  it.each(["interested", "declining", "unclear"])("uses a real validated %s decision in the AAC trace", async choice => {
    const request = vi.fn().mockResolvedValue(Response.json(response(choice)));
    vi.stubGlobal("fetch", request);
    const result = await runJevSocialDecision("Any activities nearby?");
    expect(result.data.socialIntent).toBe(choice);
    expect(result.modelUsed).toBe("typesafe/jev-1.14-20261014");
    expect(result.fallback).toBe(false);
    expect(result.agentId).toBe("aac_nudge");
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body).state).toEqual({ current_message: "Any activities nearby?" });
    expect(result.input).not.toContain("Any activities nearby?");
    expect(JSON.stringify(result)).not.toContain("test-key");
  });

  it.each(["disabled", "missing_key", "long_input", "empty_input"])("does not send %s requests", async reason => {
    if (reason === "disabled") vi.stubEnv("TRUSTKAKI_JEV_ENABLED", "false");
    if (reason === "missing_key") vi.stubEnv("OPENROUTER_API_KEY", "");
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const result = await runJevSocialDecision(reason === "long_input" ? "x".repeat(1001) : reason === "empty_input" ? " " : "Any activity?");
    expect(request).not.toHaveBeenCalled();
    expect(result.fallback).toBe(true);
    expect(result.data.socialIntent).toBeNull();
    expect(result.modelUsed).toBe("none");
  });

  it.each(["http", "timeout", "model", "distribution"])("fails closed on %s without retries or secret errors", async reason => {
    const body = response();
    if (reason === "model") body.model = "typesafe/jev-9.0";
    if (reason === "distribution") body.answers.social_intent.probabilities.interested = 1;
    const request = vi.fn();
    if (reason === "timeout") request.mockRejectedValue(new Error("secret upstream details"));
    else request.mockResolvedValue(reason === "http" ? new Response("secret upstream details", { status: 429 }) : Response.json(body));
    vi.stubGlobal("fetch", request);
    const result = await runJevSocialDecision("Stop suggesting activities.");
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.fallback).toBe(true);
    expect(result.data.socialIntent).toBeNull();
    expect(result.data.nudgeMessage).toContain("leave activities");
    expect(JSON.stringify(result)).not.toContain("secret upstream");
  });

  it("uses Mandarin replies and treats lexical cues only as eligibility", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response())));
    const result = await runJevSocialDecision("不要再推荐活动了。");
    expect(result.data.nudgeMessage).toContain("不再推荐");
    expect(hasSocialActivityCue("不要再推荐活动了。")).toBe(true);
    expect(hasSocialActivityCue("Nearby got chess or not?")).toBe(true);
    expect(hasSocialActivityCue("Good morning")).toBe(false);
  });

  it("aborts at three seconds instead of holding the chat open", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
    }));
    // Node's native AbortSignal timer is not controlled by Vitest fake timers.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    vi.stubGlobal("fetch", request);
    const pending = runJevSocialDecision("Any activities?");
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).fallback).toBe(true);
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(request).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });
});
