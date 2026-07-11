// ─── LLM Provider Abstraction ───
// OpenAI-compatible API client. Works with OpenAI, Azure OpenAI,
// Together AI, Tencent Cloud, and any provider that implements the
// OpenAI Chat Completions API format.

export interface LLMCallParams {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCallResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export class LLMProvider {
  private apiKey: string | undefined;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = process.env.TRUSTKAKI_LLM_API_KEY;
    this.baseUrl =
      process.env.TRUSTKAKI_LLM_BASE_URL || "https://api.openai.com/v1";
    this.defaultModel = process.env.TRUSTKAKI_LLM_MODEL || "gpt-4o-mini";
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  getModel(): string {
    return this.defaultModel;
  }

  async chat(params: LLMCallParams): Promise<LLMCallResult> {
    if (!this.apiKey) {
      throw new Error(
        "LLM API key not configured. Set TRUSTKAKI_LLM_API_KEY environment variable."
      );
    }

    const model = params.model || this.defaultModel;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `LLM API error (${response.status}): ${errorText.slice(0, 500)}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    if (!content) {
      throw new Error("LLM returned empty content");
    }

    return {
      content,
      model: data.model || model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }
}

// Singleton — avoids re-reading env vars on every call
let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    _provider = new LLMProvider();
  }
  return _provider;
}
