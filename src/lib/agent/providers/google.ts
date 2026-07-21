import type { LlmMessage, LlmProvider, LlmResponse, LlmToolCall } from "./types";

/**
 * Provider de Google Gemini vía REST (generateContent), sin SDK.
 * Gemini no usa ids de tool call: codificamos el nombre en el id ("nombre__n")
 * para poder armar el functionResponse a partir del toolCallId.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

function toGeminiContents(messages: LlmMessage[]): { role: "user" | "model"; parts: GeminiPart[] }[] {
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.argsJson) as Record<string, unknown>;
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name: c.name, args } });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
    } else {
      const name = m.toolCallId.split("__")[0];
      let response: Record<string, unknown>;
      try {
        const parsed = JSON.parse(m.content) as unknown;
        response =
          parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : { result: parsed };
      } catch {
        response = { result: m.content };
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
    }
  }
  return contents;
}

export function makeGoogleProvider(apiKey: string, fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    async chat(input): Promise<LlmResponse> {
      const body = {
        system_instruction: { parts: [{ text: input.system }] },
        contents: toGeminiContents(input.messages),
        ...(input.tools.length > 0
          ? {
              tools: [
                {
                  functionDeclarations: input.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                  })),
                },
              ],
            }
          : {}),
        generationConfig: { temperature: input.temperature, maxOutputTokens: 1024 },
      };

      const res = await fetchImpl(
        `${BASE}/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: GeminiPart[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      let text: string | null = null;
      const toolCalls: LlmToolCall[] = [];
      let i = 0;
      for (const p of parts) {
        if ("text" in p && p.text) text = (text ?? "") + p.text;
        if ("functionCall" in p) {
          toolCalls.push({
            id: `${p.functionCall.name}__${i++}`,
            name: p.functionCall.name,
            argsJson: JSON.stringify(p.functionCall.args ?? {}),
          });
        }
      }
      return {
        text,
        toolCalls,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    },
  };
}
