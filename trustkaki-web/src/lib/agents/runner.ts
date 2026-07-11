// ─── Shared Agent Runner ───
// Handles: prompt assembly, LLM invocation, Zod schema validation,
// retries, timeout, logging, and trace ID generation.

import type { ZodSchema } from "zod";
import type { AgentId, AgentTrace } from "@/lib/types";
import type { AgentRunResult } from "./contracts";
import { getLLMProvider } from "./provider";

export interface RunAgentParams<T> {
  agentId: AgentId;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
  fallback: () => T;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  inputSummary?: string;
  stateChanges?: string[];
}

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeParseJSON(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code fences
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // continue
      }
    }
    // Try finding the first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // continue
      }
    }
    throw new Error("Failed to parse JSON from LLM response");
  }
}

function summarizeText(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function summarizeOutput(value: unknown): string {
  if (typeof value !== "object" || value === null) return summarizeText(String(value));
  const data = value as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(data.signals)) parts.push(`${data.signals.length} signal(s)`);
  if (Array.isArray(data.agentsToRun)) parts.push(`route: ${data.agentsToRun.join(", ")}`);
  if (typeof data.riskLevel === "string") parts.push(`risk: ${data.riskLevel}`);
  if (typeof data.finalRisk === "string") parts.push(`final risk: ${data.finalRisk}`);
  if (typeof data.humanFollowUpRequired === "boolean") {
    parts.push(`human follow-up: ${data.humanFollowUpRequired ? "yes" : "no"}`);
  }
  if (typeof data.isScam === "boolean") parts.push(`scam suspected: ${data.isScam ? "yes" : "no"}`);
  if (Array.isArray(data.recommendedActions)) parts.push(`${data.recommendedActions.length} action(s)`);
  return parts.length > 0 ? parts.join("; ") : summarizeText(JSON.stringify(value));
}

function logAgent(
  agentId: string,
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
): void {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  const prefix = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  prefix(`[TrustKaki:${agentId}] ${ts} ${message}${metaStr}`);
}

export async function runAgent<T>(
  params: RunAgentParams<T>
): Promise<AgentRunResult<T>> {
  const {
    agentId,
    agentName,
    systemPrompt,
    userPrompt,
    schema,
    fallback,
    maxRetries = 2,
    timeoutMs = 30000,
    temperature = 0.7,
    inputSummary,
    stateChanges = [],
  } = params;

  const traceId = generateTraceId();
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  const provider = getLLMProvider();

  // ── If LLM is not configured, use fallback immediately ──
  if (!provider.isConfigured) {
    logAgent(agentId, "warn", "LLM not configured — using fallback", {
      traceId,
    });
    const fallbackData = fallback();
    return {
      agentId,
      agentName,
      traceId,
      timestamp,
      input: userPrompt,
      reasoning:
        "LLM API key not configured (TRUSTKAKI_LLM_API_KEY). Using safe fallback response.",
      output: JSON.stringify(fallbackData, null, 2),
      tags: ["fallback", "no_llm"],
      data: fallbackData,
      durationMs: Date.now() - startTime,
      modelUsed: "none",
      fallback: true,
      inputSummary: inputSummary ?? summarizeText(userPrompt),
      outputSummary: summarizeOutput(fallbackData),
      stateChanges,
      errorMessage: "LLM not configured",
    };
  }

  logAgent(agentId, "info", "Starting agent run", {
    traceId,
    model: provider.getModel(),
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // ── Call LLM with timeout ──
      const result = await Promise.race([
        provider.chat({ systemPrompt, userPrompt, temperature }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Agent timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);

      // ── Parse JSON ──
      const parsed = safeParseJSON(result.content);

      // ── Validate with Zod ──
      const validation = schema.safeParse(parsed);
      if (!validation.success) {
        throw new Error(
          `Schema validation failed: ${validation.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`
        );
      }

      const data = validation.data;
      const durationMs = Date.now() - startTime;

      logAgent(agentId, "info", "Agent run succeeded", {
        traceId,
        attempt: attempt + 1,
        durationMs,
        model: result.model,
        tokens: result.usage,
      });

      return {
        agentId,
        agentName,
        traceId,
        timestamp,
        input: userPrompt,
        reasoning: `LLM responded successfully (attempt ${attempt + 1}/${maxRetries + 1}). Model: ${result.model}. Tokens: ${result.usage.promptTokens}+${result.usage.completionTokens}`,
        output: JSON.stringify(data, null, 2),
        tags: ["llm_success", `attempt_${attempt + 1}`],
        data,
        durationMs,
        modelUsed: result.model,
        fallback: false,
        inputSummary: inputSummary ?? summarizeText(userPrompt),
        outputSummary: summarizeOutput(data),
        stateChanges,
        errorMessage: null,
      };
    } catch (error) {
      lastError = error as Error;
      logAgent(agentId, "warn", `Attempt ${attempt + 1} failed`, {
        traceId,
        error: lastError.message,
      });
    }
  }

  // ── All retries exhausted — return fallback ──
  const fallbackData = fallback();
  const durationMs = Date.now() - startTime;

  logAgent(agentId, "error", "All retries exhausted — using fallback", {
    traceId,
    durationMs,
    lastError: lastError?.message,
  });

  return {
    agentId,
    agentName,
    traceId,
    timestamp,
    input: userPrompt,
    reasoning: `All ${maxRetries + 1} attempts failed. Last error: ${lastError?.message}. Using safe fallback.`,
    output: JSON.stringify(fallbackData, null, 2),
    tags: ["fallback", "llm_error"],
    data: fallbackData,
    durationMs,
    modelUsed: "none",
    fallback: true,
    inputSummary: inputSummary ?? summarizeText(userPrompt),
    outputSummary: summarizeOutput(fallbackData),
    stateChanges,
    errorMessage: lastError?.message ?? "Unknown LLM error",
  };
}

// ── Helper: convert AgentRunResult to AgentTrace ──
export function toAgentTrace(result: AgentRunResult<unknown>): AgentTrace {
  return {
    id: result.traceId,
    agentId: result.agentId,
    agentName: result.agentName,
    timestamp: result.timestamp,
    input: result.input,
    reasoning: result.reasoning,
    output: result.output,
    tags: result.tags,
    durationMs: result.durationMs,
    modelUsed: result.modelUsed,
    fallback: result.fallback,
    inputSummary: result.inputSummary,
    outputSummary: result.outputSummary,
    stateChanges: result.stateChanges,
    errorMessage: result.errorMessage ?? null,
  };
}
