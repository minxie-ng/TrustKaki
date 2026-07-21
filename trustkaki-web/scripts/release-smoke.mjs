const TIMEOUT_MS = 8000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

class SmokeFailure extends Error {
  constructor(path, category) {
    super(category);
    this.path = path;
    this.category = category;
  }
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value);
    if (
      !ALLOWED_PROTOCOLS.has(url.protocol) ||
      url.username !== "" ||
      url.password !== "" ||
      url.href.includes("?") ||
      url.href.includes("#")
    ) {
      throw new Error();
    }
    return url.href.replace(/\/$/, "");
  } catch {
    throw new SmokeFailure("/", "invalid base URL");
  }
}

function isTimeoutError(error) {
  return error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
}

async function request(baseUrl, path, expectedContentType) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: expectedContentType },
    });
  } catch (error) {
    const category = isTimeoutError(error) ? "timeout" : "network error";
    throw new SmokeFailure(path, category);
  }

  if (!response.ok) {
    throw new SmokeFailure(path, "unexpected status");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== expectedContentType) {
    throw new SmokeFailure(path, "unexpected content type");
  }

  return response;
}

async function checkJson(baseUrl, path, validate) {
  const response = await request(baseUrl, path, "application/json");
  let body;
  try {
    body = await response.json();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new SmokeFailure(path, "timeout");
    }
    throw new SmokeFailure(path, "invalid response");
  }
  if (!validate(body)) {
    throw new SmokeFailure(path, "invalid response");
  }
}

async function checkHtml(baseUrl, path) {
  const response = await request(baseUrl, path, "text/html");
  let body;
  try {
    body = await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new SmokeFailure(path, "timeout");
    }
    throw new SmokeFailure(path, "invalid response");
  }
  if (body.trim() === "") {
    throw new SmokeFailure(path, "invalid response");
  }
}

try {
  const baseUrl = normalizeBaseUrl(process.argv[2]);

  await checkJson(baseUrl, "/api/health", (body) => {
    return body?.status === "ok" &&
      body?.checks?.app === true &&
      body?.checks?.database === true &&
      body?.checks?.llmConfigured === true &&
      typeof body?.checks?.telegramConfigured === "boolean" &&
      typeof body?.checks?.whatsappConfigured === "boolean";
  });
  await checkHtml(baseUrl, "/privacy");
  await checkHtml(baseUrl, "/data-deletion");
  process.stdout.write(
    "PASS /api/health\n" +
    "PASS /privacy\n" +
    "PASS /data-deletion\n" +
    "RELEASE SMOKE PASSED\n"
  );
} catch (error) {
  const failure = error instanceof SmokeFailure
    ? error
    : new SmokeFailure("/", "network error");
  process.stderr.write(`FAIL ${failure.path}: ${failure.category}\n`);
  process.exitCode = 1;
}
