# Flow Creator (wa-blast) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Tests are Vitest. Frente C1: create+publish WhatsApp Flows, with a raw JSON editor AND an AI generator. Sending (C2) / responses (C3) are out of scope.

**Goal:** Let users create and publish WhatsApp lead-capture Flows from wa-blast — by writing the Flow JSON directly, or by describing the form in natural language and having Claude generate the Flow JSON.

**Architecture:** A Flow API client (`lib/meta/flows.ts`) over the existing Graph `request` helper; an AI generator (`lib/flow-ai.ts`) using `@anthropic-ai/sdk` (claude-opus-4-8, adaptive thinking, prompt-cached schema system prompt); a `/flows` list + `/flows/nueva` page with a raw JSON editor + "Generar con IA" button + "Crear y publicar".

**Tech Stack:** Next 16 · Bun · React 19 · `@anthropic-ai/sdk` · Meta Graph v22 · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-flow-creator-design.md`

---

## File Structure

**Create:** `src/lib/meta/flows.ts`, `src/lib/flow-ai.ts`, `src/app/(app)/flows/page.tsx`,
`src/app/(app)/flows/nueva/page.tsx`, `src/app/(app)/flows/nueva/flow-form.tsx`,
`src/app/(app)/flows/nueva/actions.ts`, tests `tests/unit/flows.test.ts`, `tests/unit/flow-ai.test.ts`.
**Modify:** `src/lib/env.ts` (ANTHROPIC_API_KEY), the app nav (add "Flows"), `package.json` (dep).

---

# Task 1: Deps + env

**Files:** Modify `package.json`, `src/lib/env.ts`

- [ ] **Step 1:** `bun add @anthropic-ai/sdk`
- [ ] **Step 2:** In `src/lib/env.ts`, add to the schema: `ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),` (optional so the app still boots without it; the action errors clearly if missing).
- [ ] **Step 3:** `bunx tsc --noEmit` clean. Commit:
```bash
git add package.json bun.lock src/lib/env.ts
git commit -m "feat(flows): add @anthropic-ai/sdk + ANTHROPIC_API_KEY env"
```

---

# Task 2: Meta Flows client (TDD)

**Files:** Create `src/lib/meta/flows.ts`; Test `tests/unit/flows.test.ts`

READ `src/lib/meta/graph.ts` for `GraphCreds`, `request`, `MetaApiError`, `GRAPH_API`.

- [ ] **Step 1: failing test** (`tests/unit/flows.test.ts`):
```ts
import { afterEach, describe, expect, test } from "vitest";
import { buildCreateFlowBody } from "@/lib/meta/flows";

describe("buildCreateFlowBody", () => {
  test("stringifies flow_json + sets categories", () => {
    const body = buildCreateFlowBody({ name: "Leads", categories: ["LEAD_GENERATION"], flowJson: '{"version":"6.3","screens":[]}' });
    expect(body.name).toBe("Leads");
    expect(body.categories).toEqual(["LEAD_GENERATION"]);
    expect(typeof body.flow_json).toBe("string");
    expect(JSON.parse(body.flow_json as string).version).toBe("6.3");
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** `src/lib/meta/flows.ts`:
```ts
import { type GraphCreds } from "./graph";

const GRAPH_API = "https://graph.facebook.com/v22.0";

export type FlowCategory =
  | "SIGN_UP" | "SIGN_IN" | "APPOINTMENT_BOOKING" | "LEAD_GENERATION"
  | "CONTACT_US" | "CUSTOMER_SUPPORT" | "SURVEY" | "OTHER";

export type Flow = { id: string; name: string; status: string; categories: string[] };

export function buildCreateFlowBody(input: { name: string; categories: FlowCategory[]; flowJson: string }): Record<string, unknown> {
  return { name: input.name, categories: input.categories, flow_json: input.flowJson };
}

async function flowRequest<T>(creds: GraphCreds, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${creds.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number } } | null)?.error;
    // reuse MetaApiError from graph.ts
    const { MetaApiError } = await import("./graph");
    throw new MetaApiError(err?.code ?? res.status, undefined, body, err?.message ?? `Meta ${res.status}`);
  }
  return body as T;
}

export async function createFlow(creds: GraphCreds, input: { name: string; categories: FlowCategory[]; flowJson: string }): Promise<{ id: string }> {
  return flowRequest(creds, `/${creds.wabaId}/flows`, { method: "POST", body: JSON.stringify(buildCreateFlowBody(input)) });
}

export async function publishFlow(creds: GraphCreds, flowId: string): Promise<{ success?: boolean }> {
  return flowRequest(creds, `/${flowId}`, { method: "POST", body: JSON.stringify({ status: "PUBLISHED" }) });
}

export async function listFlows(creds: GraphCreds): Promise<Flow[]> {
  const res = await flowRequest<{ data?: Flow[] }>(creds, `/${creds.wabaId}/flows?fields=id,name,status,categories&limit=100`);
  return res.data ?? [];
}

export async function createAndPublishFlow(creds: GraphCreds, input: { name: string; categories: FlowCategory[]; flowJson: string }): Promise<{ id: string; status: string }> {
  const { id } = await createFlow(creds, input);
  await publishFlow(creds, id);
  return { id, status: "PUBLISHED" };
}
```
(If `graph.ts` exports `MetaApiError` directly, import it at the top instead of the dynamic import.)
- [ ] **Step 4:** run → PASS. `bunx tsc --noEmit` clean.
- [ ] **Step 5: commit** `feat(flows): Meta Flows client (create/publish/list)`.

---

# Task 3: AI Flow generator (TDD)

**Files:** Create `src/lib/flow-ai.ts`; Test `tests/unit/flow-ai.test.ts`

- [ ] **Step 1: failing test** (`tests/unit/flow-ai.test.ts`) — test the pure JSON-extraction helper (no network):
```ts
import { describe, expect, test } from "vitest";
import { extractFlowJson } from "@/lib/flow-ai";

describe("extractFlowJson", () => {
  test("extracts from fenced block", () => {
    const out = extractFlowJson('```json\n{"version":"6.3","screens":[]}\n```');
    expect(JSON.parse(out).version).toBe("6.3");
  });
  test("extracts from prose-wrapped json", () => {
    const out = extractFlowJson('Aquí tienes:\n{"version":"6.3","screens":[]}\nListo.');
    expect(JSON.parse(out).version).toBe("6.3");
  });
  test("passes through clean json", () => {
    expect(JSON.parse(extractFlowJson('{"version":"6.3","screens":[]}')).screens).toEqual([]);
  });
  test("throws on no json", () => {
    expect(() => extractFlowJson("no hay json aquí")).toThrow();
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** `src/lib/flow-ai.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

export function extractFlowJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("La respuesta no contenía JSON");
  const slice = candidate.slice(start, end + 1);
  JSON.parse(slice); // throws if invalid
  return slice;
}

const SYSTEM = `Generas WhatsApp Flow JSON para formularios de captura de leads. Devuelve SOLO JSON válido, sin markdown ni texto.

Esquema (Flow JSON version "6.3", estático, sin data_api_version ni endpoint):
- Nivel superior: { "version": "6.3", "screens": [ ...Screen ] }
- Screen: { "id": "SCREEN_ID" (MAYÚSCULAS_SNAKE), "title": "Título", "terminal": true (SOLO en la última), "success": true (en la terminal), "data": {}, "layout": Layout }
- Layout: { "type": "SingleColumnLayout", "children": [ Form ] }
- Form: { "type": "Form", "name": "form", "children": [ ...componentes, Footer ] }
- Componentes: TextHeading/TextBody/TextSubheading { "type", "text" }; TextInput { "type":"TextInput","name":"campo","label":"...","input-type":"text|email|number|phone","required":true }; TextArea similar; Dropdown/RadioButtonsGroup/CheckboxGroup { "type","name","label","required","data-source":[{"id":"1","title":"Opción"}] }; DatePicker { "type":"DatePicker","name","label" }.
- Footer (último hijo del Form): { "type":"Footer","label":"Enviar","on-click-action":{ "name":"complete","payload":{ "campo":"\${form.campo}" } } }. Multi-pantalla: pantallas no terminales usan { "name":"navigate","next":{ "type":"screen","name":"SIGUIENTE_ID" },"payload":{...} }; la terminal usa "complete".

Reglas: ≥1 pantalla; exactamente una terminal (la última) con "terminal":true y "success":true; "name" de componentes en snake_case minúsculas; ids de pantalla en MAYÚSCULAS_SNAKE; incluye los campos pedidos + por defecto nombre y teléfono si no se especifican; etiquetas en español salvo que la petición esté en otro idioma.`;

export async function generateFlowJson(request: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  async function ask(extra?: string): Promise<string> {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Genera el Flow JSON para: ${request}${extra ? `\n\n${extra}` : ""}` }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }
  const first = await ask();
  try {
    return JSON.stringify(JSON.parse(extractFlowJson(first)), null, 2);
  } catch {
    const second = await ask("Tu salida anterior no era JSON válido. Devuelve SOLO el JSON del Flow, sin texto.");
    return JSON.stringify(JSON.parse(extractFlowJson(second)), null, 2);
  }
}
```
- [ ] **Step 4:** run → PASS (the unit test only covers `extractFlowJson`; `generateFlowJson` is exercised in manual smoke). `bunx tsc --noEmit` clean.
- [ ] **Step 5: commit** `feat(flows): AI Flow JSON generator (Anthropic SDK, cached schema prompt)`.

---

# Task 4: Server actions

**Files:** Create `src/app/(app)/flows/nueva/actions.ts`

READ an existing actions file (e.g. `plantillas/nueva/actions.ts`) for the `requireOrg` + `getOrgSettings` + `credsFromSettings` pattern.

- [ ] **Step 1: implement**:
```ts
"use server";

import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, MetaApiError } from "@/lib/meta/graph";
import { createAndPublishFlow, type FlowCategory } from "@/lib/meta/flows";
import { generateFlowJson } from "@/lib/flow-ai";

export type GenerateFlowResult = { ok: true; flowJson: string } | { ok: false; error: string };
export async function generateFlowAction(request: string): Promise<GenerateFlowResult> {
  await requireOrg();
  if (!request.trim()) return { ok: false, error: "Describe el formulario que quieres" };
  try {
    return { ok: true, flowJson: await generateFlowJson(request) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al generar" };
  }
}

export type CreateFlowResult = { ok: true; id: string; status: string } | { ok: false; error: string };
export async function createFlowAction(input: { name: string; category: FlowCategory; flowJson: string }): Promise<CreateFlowResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura tus credenciales de Meta primero" };
  if (!input.name.trim()) return { ok: false, error: "Ponle un nombre al Flow" };
  try {
    JSON.parse(input.flowJson);
  } catch {
    return { ok: false, error: "El Flow JSON no es válido" };
  }
  try {
    const res = await createAndPublishFlow(creds, { name: input.name, categories: [input.category], flowJson: input.flowJson });
    return { ok: true, id: res.id, status: res.status };
  } catch (e) {
    if (e instanceof MetaApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear" };
  }
}
```
(Confirm `credsFromSettings` + `MetaApiError` are exported from `graph.ts`; `credsFromSettings` needs `metaWabaId` + `metaAccessToken` on the settings — same as templates.)
- [ ] **Step 2:** `bunx tsc --noEmit` clean. Commit `feat(flows): server actions (generate + create/publish)`.

---

# Task 5: UI — list + create page

**Files:** Create `src/app/(app)/flows/page.tsx`, `.../flows/nueva/page.tsx`, `.../flows/nueva/flow-form.tsx`; Modify the app nav.

- [ ] **Step 1: `flows/page.tsx`** (server) — gate on creds (mirror `plantillas/nueva/page.tsx`); load `listFlows(creds)`; render a list (name, status badge, categories) + a "Nueva" link to `/flows/nueva`. Empty state + a creds-missing notice like the templates page.

- [ ] **Step 2: `flows/nueva/page.tsx`** (server) — creds gate → render `<FlowForm />`. Header + a one-line explainer ("Crea un formulario interactivo (Flow) para captura de leads").

- [ ] **Step 3: `flows/nueva/flow-form.tsx`** (client):
```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateFlowAction, createFlowAction } from "./actions";
import type { FlowCategory } from "@/lib/meta/flows";

const CATEGORIES: { value: FlowCategory; label: string }[] = [
  { value: "LEAD_GENERATION", label: "Captura de leads" },
  { value: "SIGN_UP", label: "Registro" },
  { value: "APPOINTMENT_BOOKING", label: "Agendamiento" },
  { value: "SURVEY", label: "Encuesta" },
  { value: "CONTACT_US", label: "Contacto" },
  { value: "CUSTOMER_SUPPORT", label: "Soporte" },
  { value: "SIGN_IN", label: "Inicio de sesión" },
  { value: "OTHER", label: "Otro" },
];

const SAMPLE = '{\n  "version": "6.3",\n  "screens": []\n}';

export function FlowForm() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FlowCategory>("LEAD_GENERATION");
  const [request, setRequest] = useState("");
  const [flowJson, setFlowJson] = useState(SAMPLE);
  const [generating, startGen] = useTransition();
  const [creating, startCreate] = useTransition();

  const jsonValid = (() => { try { JSON.parse(flowJson); return true; } catch { return false; } })();

  function generate() {
    if (!request.trim()) { toast.error("Describe el formulario"); return; }
    startGen(async () => {
      const res = await generateFlowAction(request);
      if (!res.ok) return toast.error(res.error);
      setFlowJson(res.flowJson);
      toast.success("Flow generado — revísalo y publícalo");
    });
  }
  function create() {
    startCreate(async () => {
      const res = await createFlowAction({ name, category, flowJson });
      if (!res.ok) return toast.error(res.error);
      toast.success(`Flow "${name}" creado (${res.status}) · id ${res.id}`, { duration: 8000 });
      setName(""); setRequest(""); setFlowJson(SAMPLE);
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><SparklesIcon className="size-4" /> Generar con IA</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="req" className="text-xs">Describe el formulario que quieres (campos, opciones…)</Label>
          <textarea id="req" value={request} onChange={(e) => setRequest(e.target.value)} rows={3}
            placeholder="Captura de leads para mi restaurante: nombre, teléfono, y un menú desplegable con qué busca (almuerzo, evento, domicilio)."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <Button type="button" onClick={generate} disabled={generating}>{generating ? "Generando…" : "Generar Flow"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="name">Nombre del Flow</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Captura leads restaurante" /></div>
          <div><Label>Categoría</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as FlowCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Flow JSON</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <textarea value={flowJson} onChange={(e) => setFlowJson(e.target.value)} rows={18} spellCheck={false}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" />
          <p className={`text-[11px] ${jsonValid ? "text-muted-foreground" : "text-destructive"}`}>{jsonValid ? "JSON válido. Meta lo validará al publicar." : "JSON inválido"}</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/flows" className="text-sm text-muted-foreground hover:underline">Cancelar</Link>
        <Button onClick={create} disabled={creating || !jsonValid || !name.trim()} size="lg">{creating ? "Publicando…" : "Crear y publicar en Meta"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: nav** — add a "Flows" link to the app sidebar/nav (find where `/plantillas`, `/campanas` links live in `(app)/layout.tsx` and add `/flows` with a matching icon).

- [ ] **Step 5:** `bunx tsc --noEmit` clean; `bun run lint` no new errors. Commit `feat(flows): /flows list + /flows/nueva (raw editor + AI generator)`.

---

# Task 6: Gate

- [ ] `bun run test` (existing + new pass) · `bunx tsc --noEmit` clean · `bun run lint` 0 errors · `bun run build` succeeds.
- [ ] Manual smoke (needs `ANTHROPIC_API_KEY` + Meta creds): describe a lead form → generate → publish → see it in `/flows`.
- [ ] Commit any gate fixes.

---

## Notes
- `ANTHROPIC_API_KEY` server-side only (used in a server action; never shipped to client).
- C2 (send Flow to contacts via a template FLOW button / interactive flow message) and C3 (receive submitted lead data via webhook) are separate sub-projects. The clonai-blast port mirrors this once C1 lands.
