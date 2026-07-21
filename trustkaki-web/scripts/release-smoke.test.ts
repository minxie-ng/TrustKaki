import { execFile } from "node:child_process";
import { createServer, type RequestListener, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL("./release-smoke.mjs", import.meta.url));

type CliResult = {
  code: number;
  stderr: string;
  stdout: string;
};

async function runCli(baseUrl: string): Promise<CliResult> {
  try {
    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, baseUrl],
      { encoding: "utf8", killSignal: "SIGKILL", timeout: 10_000 }
    );
    return { code: 0, stderr, stdout };
  } catch (error) {
    const result = error as Error & {
      code: number;
      stderr: string;
      stdout: string;
    };
    return {
      code: result.code,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withServer(
  handler: RequestListener,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    await run(baseUrl);
  } finally {
    await close(server);
  }
}

function expectOnlyFailure(
  result: CliResult,
  path: string,
  category:
    | "invalid base URL"
    | "timeout"
    | "network error"
    | "unexpected status"
    | "unexpected content type"
    | "invalid response"
): void {
  expect(result.code).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(`FAIL ${path}: ${category}\n`);
}

const health = {
  status: "ok",
  checks: {
    app: true,
    supabasePublicConfigured: true,
    supabaseServiceConfigured: true,
    database: true,
    llmConfigured: true,
    telegramConfigured: true,
    telegramProcessorConfigured: true,
    schedulerConfigured: true,
    whatsappConfigured: false,
    whatsappProcessorConfigured: false,
    internalProcessorConfigured: false,
  },
  version: "0.1.0",
  commit: "0123456789ab",
  diagnostic: "telegram-token",
};

describe("release smoke CLI", () => {
  it("passes the public health and legal endpoints", async () => {
    const requests: Array<{ method?: string; url?: string }> = [];
    await withServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      if (request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(health));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>TrustKaki</title>");
    }, async (baseUrl) => {
      const result = await runCli(`${baseUrl}/`);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("PASS /api/health");
      expect(result.stdout).toContain("PASS /privacy");
      expect(result.stdout).toContain("PASS /data-deletion");
      expect(result.stdout).toContain("RELEASE SMOKE PASSED");
      expect(result.stdout).not.toContain("telegram-token");
      expect(requests).toEqual([
        { method: "GET", url: "/api/health" },
        { method: "GET", url: "/privacy" },
        { method: "GET", url: "/data-deletion" },
      ]);
    });
  });

  it("rejects an invalid base URL without echoing it or the caught error", async () => {
    const invalidUrl = "not-a-url SECRET_INVALID_URL";
    const result = await runCli(invalidUrl);

    expectOnlyFailure(result, "/", "invalid base URL");
    expect(result.stderr).not.toContain(invalidUrl);
    expect(result.stderr).not.toContain("Invalid URL");
  });

  it("rejects credentials in the base URL without leaking them", async () => {
    const result = await runCli("http://release-token:release-secret@127.0.0.1");

    expectOnlyFailure(result, "/", "invalid base URL");
    expect(result.stderr).not.toContain("release-token");
    expect(result.stderr).not.toContain("release-secret");
  });

  it.each([
    "http://127.0.0.1?token=query-secret",
    "http://127.0.0.1#fragment-secret",
    "http://127.0.0.1?",
    "http://127.0.0.1#",
  ])("rejects query and fragment base URLs without leaking them", async (baseUrl) => {
    const result = await runCli(baseUrl);

    expectOnlyFailure(result, "/", "invalid base URL");
    expect(result.stderr).not.toContain("query-secret");
    expect(result.stderr).not.toContain("fragment-secret");
  });

  it("reports a bounded status failure without printing the response body", async () => {
    await withServer((_request, response) => {
      response.writeHead(503, { "content-type": "application/json" });
      response.end('{"secret":"TOP_SECRET_503_BODY"}');
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/api/health", "unexpected status");
      expect(result.stderr).not.toContain("TOP_SECRET_503_BODY");
    });
  });

  it("reports malformed health JSON as an invalid response without leaking it", async () => {
    await withServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"secret":"TOP_SECRET_MALFORMED"');
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/api/health", "invalid response");
      expect(result.stderr).not.toContain("TOP_SECRET_MALFORMED");
      expect(result.stderr).not.toContain("JSON");
    });
  });

  it("rejects a valid JSON response with an invalid health shape", async () => {
    await withServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ok","secret":"TOP_SECRET_INVALID_SHAPE"}');
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/api/health", "invalid response");
      expect(result.stderr).not.toContain("TOP_SECRET_INVALID_SHAPE");
    });
  });

  it("rejects an incorrect health content type without printing its body", async () => {
    await withServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("TOP_SECRET_WRONG_CONTENT_TYPE");
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/api/health", "unexpected content type");
      expect(result.stderr).not.toContain("TOP_SECRET_WRONG_CONTENT_TYPE");
    });
  });

  it("does not follow redirects", async () => {
    let redirectTargetReached = false;
    await withServer((request, response) => {
      if (request.url?.startsWith("/redirect-target")) {
        redirectTargetReached = true;
      }
      response.writeHead(302, {
        location: "/redirect-target?token=TOP_SECRET_REDIRECT_TOKEN",
      });
      response.end("TOP_SECRET_REDIRECT_BODY");
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/api/health", "network error");
      expect(result.stderr).not.toContain("TOP_SECRET_REDIRECT_TOKEN");
      expect(result.stderr).not.toContain("TOP_SECRET_REDIRECT_BODY");
      expect(redirectTargetReached).toBe(false);
    });
  });

  it("reports a later HTML failure without retaining partial success output", async () => {
    await withServer((request, response) => {
      if (request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(health));
        return;
      }
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("TOP_SECRET_PRIVACY_BODY");
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/privacy", "unexpected content type");
      expect(result.stderr).not.toContain("TOP_SECRET_PRIVACY_BODY");
    });
  });

  it("rejects an empty HTML response", async () => {
    await withServer((request, response) => {
      if (request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(health));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end();
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/privacy", "invalid response");
    });
  });

  it("classifies a timeout while reading an HTML body", { timeout: 12_000 }, async () => {
    await withServer((request, response) => {
      if (request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(health));
        return;
      }
      if (request.url === "/privacy") {
        response.writeHead(200, { "content-type": "text/html" });
        response.write("<!doctype html>");
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>TrustKaki</title>");
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/privacy", "timeout");
      expect(result.stderr).not.toContain(baseUrl);
      expect(result.stderr).not.toContain("AbortError");
    });
  });

  it("classifies a timeout while reading the health body", { timeout: 12_000 }, async () => {
    await withServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"status":');
    }, async (baseUrl) => {
      const result = await runCli(baseUrl);

      expectOnlyFailure(result, "/api/health", "timeout");
      expect(result.stderr).not.toContain(baseUrl);
      expect(result.stderr).not.toContain("AbortError");
    });
  });
});
