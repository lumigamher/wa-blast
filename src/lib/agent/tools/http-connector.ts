import { z } from "zod";
import type { AgentTool, ToolResult } from "./types";

export type HttpParam = {
  name: string;
  type: "string" | "number";
  required: boolean;
  in: "query" | "path" | "body";
};

export type HttpConnectorConfig = {
  name: string;
  description: string;
  method: "GET" | "POST";
  urlTemplate: string;
  headers: Record<string, string>;
  auth:
    | { type: "none" }
    | { type: "bearer"; token: string }
    | { type: "apiKey"; header: string; value: string };
  params: HttpParam[];
  responseMapping: string | null;
};

/** Valida la config de un conector HTTP (proviene de input del usuario). */
export const httpConnectorConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  method: z.enum(["GET", "POST"]),
  urlTemplate: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  auth: z.union([
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("bearer"), token: z.string() }),
    z.object({ type: z.literal("apiKey"), header: z.string(), value: z.string() }),
  ]),
  params: z.array(
    z.object({
      name: z.string().min(1),
      type: z.enum(["string", "number"]),
      required: z.boolean(),
      in: z.enum(["query", "path", "body"]),
    }),
  ),
  responseMapping: z.string().nullable(),
});

const TIMEOUT_MS = 8000;

function buildSchema(params: HttpParam[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of params) {
    let base: z.ZodTypeAny = p.type === "number" ? z.number() : z.string();
    if (!p.required) base = base.optional();
    shape[p.name] = base;
  }
  return z.object(shape);
}

function buildJsonSchema(params: HttpParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = { type: p.type };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

function pick(obj: unknown, path: string | null): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

export function makeHttpTool(cfg: HttpConnectorConfig): AgentTool {
  const schema = buildSchema(cfg.params);
  return {
    name: cfg.name,
    description: cfg.description,
    paramsSchema: schema,
    jsonSchema: buildJsonSchema(cfg.params),
    async run(rawArgs): Promise<ToolResult> {
      const parsed = schema.safeParse(rawArgs);
      if (!parsed.success) return { ok: false, error: "args inválidos" };
      const args = parsed.data as Record<string, string | number>;

      let url = cfg.urlTemplate;
      const query = new URLSearchParams();
      const body: Record<string, unknown> = {};
      for (const p of cfg.params) {
        const v = args[p.name];
        if (v === undefined) continue;
        if (p.in === "path") url = url.replace(`{${p.name}}`, String(v));
        else if (p.in === "query") query.set(p.name, String(v));
        else body[p.name] = v;
      }
      if (query.size > 0) url += `?${query.toString()}`;
      const hasBody = cfg.method === "POST" && Object.keys(body).length > 0;

      const headers: Record<string, string> = { ...cfg.headers };
      if (cfg.auth.type === "bearer") headers.Authorization = `Bearer ${cfg.auth.token}`;
      if (cfg.auth.type === "apiKey") headers[cfg.auth.header] = cfg.auth.value;
      if (cfg.method === "POST") headers["Content-Type"] = "application/json";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: cfg.method,
          headers,
          body: hasBody ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const json = await res.json();
        return { ok: true, data: pick(json, cfg.responseMapping) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "error de red" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
