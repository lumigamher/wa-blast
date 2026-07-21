import { describe, expect, it, vi } from "vitest";
import { listProviderModels } from "@/lib/ai/gateway/list-models";

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("listProviderModels", () => {
  it("openai: filtra a modelos de chat y enriquece los recomendados", async () => {
    const f = mockFetch(200, {
      data: [
        { id: "gpt-5-mini" },
        { id: "gpt-4-turbo" },
        { id: "text-embedding-3-small" },
        { id: "whisper-1" },
        { id: "dall-e-3" },
      ],
    });
    const r = await listProviderModels("openai", "sk-x", null, f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = r.models.map((m) => m.id);
      expect(ids).toContain("gpt-5-mini");
      expect(ids).toContain("gpt-4-turbo");
      expect(ids).not.toContain("text-embedding-3-small");
      expect(ids).not.toContain("whisper-1");
      expect(r.models[0].id).toBe("gpt-5-mini"); // recomendado primero
      expect(r.models[0].recommended).toBe(true);
    }
  });

  it("anthropic: usa formato data[] y filtra claude-*", async () => {
    const f = mockFetch(200, { data: [{ id: "claude-haiku-4-5-20251001" }, { id: "claude-sonnet-4-6" }] });
    const r = await listProviderModels("anthropic", "sk-ant", null, f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.models.every((m) => m.id.startsWith("claude-"))).toBe(true);
  });

  it("google: usa models[] con generateContent y limpia el prefijo models/", async () => {
    const f = mockFetch(200, {
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
      ],
    });
    const r = await listProviderModels("google", "AIza", null, f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = r.models.map((m) => m.id);
      expect(ids).toEqual(expect.arrayContaining(["gemini-2.5-flash", "gemini-2.5-pro"]));
      expect(ids).not.toContain("text-embedding-004");
    }
  });

  it("custom: exige baseUrl y consulta {base}/models", async () => {
    const f = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/models");
      return new Response(JSON.stringify({ data: [{ id: "meta-llama/llama-4" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const sinBase = await listProviderModels("custom", "k", null, f);
    expect(sinBase.ok).toBe(false);
    const r = await listProviderModels("custom", "k", "https://openrouter.ai/api/v1/", f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.models[0].id).toBe("meta-llama/llama-4");
  });

  it("401 → error en lenguaje claro", async () => {
    const r = await listProviderModels("openai", "sk-mala", null, mockFetch(401, {}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("API key no es válida");
  });
});
