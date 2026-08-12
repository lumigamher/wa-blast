import { describe, expect, it } from "vitest";
import { formatContext, listProviderModels } from "./list-models";

/** Forma real de la respuesta de GET https://openrouter.ai/api/v1/models (recortada). */
const OPENROUTER_BODY = {
  data: [
    {
      id: "nvidia/nemotron-3.5-lightning:free",
      name: "NVIDIA: Nemotron 3.5 Lightning (free)",
      context_length: 1_000_000,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["temperature", "tools", "tool_choice"],
    },
    {
      id: "nvidia/nemotron-3.5-content-safety:free",
      name: "NVIDIA: Nemotron 3.5 Content Safety (free)",
      context_length: 128_000,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["temperature", "response_format"],
    },
    {
      id: "anthropic/claude-haiku-4.5",
      name: "Anthropic: Claude Haiku 4.5",
      context_length: 200_000,
      pricing: { prompt: "0.0000008", completion: "0.000004" },
      supported_parameters: ["temperature", "tools", "tool_choice"],
    },
  ],
};

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("formatContext", () => {
  it("abrevia millones y miles de tokens", () => {
    expect(formatContext(1_000_000)).toBe("1M tokens");
    expect(formatContext(262_144)).toBe("262K tokens");
    expect(formatContext(128_000)).toBe("128K tokens");
  });
  it("deja los valores pequeños tal cual", () => {
    expect(formatContext(4_096)).toBe("4K tokens");
    expect(formatContext(512)).toBe("512 tokens");
  });
});

describe("listProviderModels — openrouter", () => {
  it("descarta los modelos que no soportan tool calling", async () => {
    const r = await listProviderModels("openrouter", "sk-or-1", null, fakeFetch(OPENROUTER_BODY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.models.map((m) => m.id)).not.toContain("nvidia/nemotron-3.5-content-safety:free");
  });

  it("marca como gratuitos solo los de precio cero", async () => {
    const r = await listProviderModels("openrouter", "sk-or-1", null, fakeFetch(OPENROUTER_BODY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byId = Object.fromEntries(r.models.map((m) => [m.id, m]));
    expect(byId["nvidia/nemotron-3.5-lightning:free"]?.free).toBe(true);
    expect(byId["anthropic/claude-haiku-4.5"]?.free).toBe(false);
  });

  it("lista los gratuitos primero y conserva nombre y contexto", async () => {
    const r = await listProviderModels("openrouter", "sk-or-1", null, fakeFetch(OPENROUTER_BODY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.models[0]).toMatchObject({
      id: "nvidia/nemotron-3.5-lightning:free",
      label: "NVIDIA: Nemotron 3.5 Lightning (free)",
      contextLength: 1_000_000,
      free: true,
    });
  });

  it("consulta el endpoint de OpenRouter con la key en el header", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const spyFetch = (async (url: string, init?: RequestInit) => {
      seenUrl = String(url);
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? "");
      return new Response(JSON.stringify(OPENROUTER_BODY), { status: 200 });
    }) as unknown as typeof fetch;
    await listProviderModels("openrouter", "sk-or-1", null, spyFetch);
    expect(seenUrl).toBe("https://openrouter.ai/api/v1/models");
    expect(seenAuth).toBe("Bearer sk-or-1");
  });

  it("avisa si el catálogo no trae ningún modelo con herramientas", async () => {
    const soloSinTools = { data: [OPENROUTER_BODY.data[1]] };
    const r = await listProviderModels("openrouter", "sk-or-1", null, fakeFetch(soloSinTools));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/herramientas|modelos/i);
  });
});
