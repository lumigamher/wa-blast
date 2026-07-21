import type { GatewayProvider } from "./config";

/**
 * Lista en vivo los modelos disponibles del proveedor conectado.
 * Los ids conocidos se enriquecen con label/hint y van primero como recomendados.
 */
export type ListedModel = {
  id: string;
  label: string;
  hint?: string;
  cost?: "económico" | "equilibrado" | "premium";
  recommended?: boolean;
};

export type ListModelsResult =
  | { ok: true; models: ListedModel[] }
  | { ok: false; error: string };

const RECOMMENDED: Record<string, Omit<ListedModel, "id">> = {
  "gpt-5-mini": { label: "GPT-5 mini", hint: "Rápido y económico, ideal para alto volumen", cost: "económico", recommended: true },
  "gpt-5": { label: "GPT-5", hint: "Mayor capacidad de razonamiento", cost: "equilibrado", recommended: true },
  "claude-haiku-4-5-20251001": { label: "Claude Haiku 4.5", hint: "Rápido y económico, ideal para alto volumen", cost: "económico", recommended: true },
  "claude-sonnet-4-6": { label: "Claude Sonnet 4.6", hint: "Equilibrado calidad/costo", cost: "equilibrado", recommended: true },
  "claude-opus-4-8": { label: "Claude Opus 4.8", hint: "Máxima calidad", cost: "premium", recommended: true },
  "gemini-2.5-flash": { label: "Gemini 2.5 Flash", hint: "Muy económico con buena calidad", cost: "económico", recommended: true },
  "gemini-2.5-pro": { label: "Gemini 2.5 Pro", hint: "Mayor capacidad de razonamiento", cost: "equilibrado", recommended: true },
};

const CHAT_FILTERS: Record<GatewayProvider, (id: string) => boolean> = {
  openai: (id) =>
    (id.startsWith("gpt-") || /^o\d/.test(id)) &&
    !/(embedding|tts|whisper|audio|realtime|image|dall-e|moderation|transcribe|search)/.test(id),
  anthropic: (id) => id.startsWith("claude-"),
  google: (id) => id.startsWith("gemini-") && !/(embedding|imagen|veo|tts|image)/.test(id),
  custom: () => true,
};

function enrich(provider: GatewayProvider, ids: string[]): ListedModel[] {
  const filtered = ids.filter(CHAT_FILTERS[provider]);
  const models = filtered.map((id) => {
    const curated = RECOMMENDED[id];
    return curated ? { id, ...curated } : { id, label: id };
  });
  return models.sort((a, b) => {
    if (!!a.recommended !== !!b.recommended) return a.recommended ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function friendlyError(provider: string, status: number | null, cause?: string): string {
  if (status === 401 || status === 403)
    return "La API key no es válida o no tiene permisos. Revísala e intenta de nuevo.";
  if (status === 429) return "El proveedor está limitando las consultas. Intenta en unos minutos.";
  if (status != null) return `El proveedor respondió con un error (${status}). Intenta de nuevo.`;
  if (cause?.includes("abort") || cause?.includes("timeout"))
    return "El proveedor no respondió a tiempo. Revisa la URL o intenta de nuevo.";
  return "No pudimos conectar con el proveedor. Revisa la URL y tu conexión.";
}

export async function listProviderModels(
  provider: GatewayProvider,
  key: string,
  baseUrl?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ListModelsResult> {
  let url: string;
  let headers: Record<string, string> = {};
  if (provider === "anthropic") {
    url = "https://api.anthropic.com/v1/models?limit=100";
    headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };
  } else if (provider === "google") {
    url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`;
  } else {
    const base = provider === "custom" ? (baseUrl ?? "").replace(/\/+$/, "") : "https://api.openai.com/v1";
    if (!base) return { ok: false, error: "Falta la URL base del proveedor." };
    url = `${base}/models`;
    headers = { authorization: `Bearer ${key}` };
  }

  let res: Response;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    return { ok: false, error: friendlyError(provider, null, (e as Error)?.message ?? "") };
  }
  if (!res.ok) return { ok: false, error: friendlyError(provider, res.status) };

  try {
    const data = (await res.json()) as {
      data?: { id: string }[];
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    let ids: string[];
    if (provider === "google") {
      ids = (data.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m) => (m.name ?? "").replace(/^models\//, ""))
        .filter(Boolean);
    } else {
      ids = (data.data ?? []).map((m) => m.id);
    }
    const models = enrich(provider, ids);
    if (models.length === 0)
      return { ok: false, error: "Conectamos con el proveedor pero no encontramos modelos de chat disponibles." };
    return { ok: true, models };
  } catch {
    return { ok: false, error: "La respuesta del proveedor no tiene el formato esperado." };
  }
}
