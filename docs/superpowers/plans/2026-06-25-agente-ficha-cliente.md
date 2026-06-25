# Ficha del cliente (persistir + inyectar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente persista los datos del cliente en una ficha estructurada (vía la tool `recopilar_datos`) e inyecte esa ficha en su contexto, reduciendo la dependencia del transcript.

**Architecture:** `contacts.data_json` (memoria flexible) + `saveContactFacts` (la tool escribe ahí + columnas conocidas) + `buildCustomerProfile` (arma la ficha desde contacto+pedidos) inyectada en `buildSystemPrompt`; `HISTORY_LIMIT` baja a 10.

**Tech Stack:** TypeScript, Drizzle (bun:sqlite), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-25-agente-ficha-cliente-design.md`

**Convenciones:** tests `bunx vitest run <ruta>`; typecheck `bunx tsc --noEmit`; migración `bun run db:generate`+`bun run db:migrate`. Commits terminan `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Hechos verificados:**
- `contacts`: id, orgId, phone, name, email, company, notes, birthday, city, …
- `recopilar-datos.ts`: `run(args)` retorna `{ ok:true, data:{ recogidos } }` (no persiste); `ctx: ToolContext = { db, orgId, conversationId }`.
- `context.ts`: `buildSystemPrompt({name, systemPrompt, knowledge})` concatena base+systemPrompt+GLOBAL_RULES+(knowledge). `toLlmHistory(msgs)`.
- `turn.ts`: `HISTORY_LIMIT=20` (línea 22), carga msgs con `.limit(HISTORY_LIMIT)`, `buildSystemPrompt({ name, systemPrompt, knowledge })` (línea ~111).
- `orders`: orgId, contactId, itemsJson, totalCop, status, paymentMethod, shippingAddressJson, createdAt.

---

## Task 1: Migración `contacts.data_json`

**Files:** Modify `src/lib/db/schema/domain.ts`; migración en `drizzle/`.

- [ ] **Step 1:** En `domain.ts`, en la tabla `contacts`, añade tras `city`:
```ts
    dataJson: text("data_json").notNull().default("{}"),
```
- [ ] **Step 2:** `bun run db:generate` → verifica que la migración solo añade la columna a `contacts` (ALTER ADD COLUMN, sin DROP). `bun run db:migrate`. `bunx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(db): contacts.data_json (memoria flexible del cliente)`.

---

## Task 2: `saveContactFacts` + `recopilar_datos` persiste

**Files:** Create `src/lib/agent/customer/profile.ts`, `src/lib/agent/customer/profile.test.ts`; Modify `src/lib/agent/tools/builtin/recopilar-datos.ts`.

- [ ] **Step 1: Write failing test** `profile.test.ts` (makeTestDb + seed org/contact):
```ts
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, organization } from "@/lib/db/schema";
import { saveContactFacts } from "./profile";

async function seed(db: any) {
  await db.insert(organization).values({ id: "o1", name: "O", slug: "o1", createdAt: new Date() }).onConflictDoNothing();
  await db.insert(contacts).values({ id: "c1", orgId: "o1", phone: "57300", createdAt: new Date() }).onConflictDoNothing();
}
describe("saveContactFacts", () => {
  it("mapea campos conocidos a columnas y desconocidos a data_json", async () => {
    const { db } = makeTestDb(); await seed(db);
    await saveContactFacts(db, "o1", "c1", { nombre: "Ana", ciudad: "Cali", segmento: "mayorista" });
    const [c] = await db.select().from(contacts).where(and(eq(contacts.id, "c1"), eq(contacts.orgId, "o1")));
    expect(c.name).toBe("Ana");
    expect(c.city).toBe("Cali");
    expect(JSON.parse(c.dataJson)).toMatchObject({ segmento: "mayorista" });
  });
  it("no pisa con vacío y mergea data_json", async () => {
    const { db } = makeTestDb(); await seed(db);
    await saveContactFacts(db, "o1", "c1", { segmento: "mayorista" });
    await saveContactFacts(db, "o1", "c1", { nombre: "", horario: "después de las 6" });
    const [c] = await db.select().from(contacts).where(eq(contacts.id, "c1"));
    expect(c.name).toBeFalsy();
    expect(JSON.parse(c.dataJson)).toMatchObject({ segmento: "mayorista", horario: "después de las 6" });
  });
  it("no rompe si el contacto no existe / otra org", async () => {
    const { db } = makeTestDb(); await seed(db);
    await expect(saveContactFacts(db, "o1", "nope", { x: "1" })).resolves.toBeUndefined();
    await saveContactFacts(db, "OTRA", "c1", { nombre: "X" });
    const [c] = await db.select().from(contacts).where(eq(contacts.id, "c1"));
    expect(c.name).toBeFalsy(); // org distinta no escribe
  });
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implementación** `src/lib/agent/customer/profile.ts` (la parte de saveContactFacts):
```ts
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contacts, conversations, orders } from "@/lib/db/schema";

const KNOWN: Record<string, "name" | "city" | "email" | "company" | "birthday" | "notes"> = {
  nombre: "name", name: "name", ciudad: "city", city: "city", email: "email", correo: "email",
  empresa: "company", company: "company", cumpleanos: "birthday", "cumpleaños": "birthday", birthday: "birthday",
  notas: "notes", notes: "notes",
};

export async function saveContactFacts(
  db: DB, orgId: string, contactId: string, campos: Record<string, string | number>,
): Promise<void> {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
  if (!c) return;
  const set: Record<string, unknown> = {};
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(c.dataJson ?? "{}"); } catch { data = {}; }
  for (const [k, raw] of Object.entries(campos)) {
    const v = String(raw).trim();
    if (!v) continue;
    const key = k.trim().toLowerCase();
    const col = KNOWN[key];
    if (col) set[col] = v;
    else data[key] = v;
  }
  set.dataJson = JSON.stringify(data);
  await db.update(contacts).set(set).where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
}
```

- [ ] **Step 4: Run green.** Luego modifica `recopilar-datos.ts` para persistir:
```ts
import { z } from "zod";
import { eq } from "drizzle-orm";
import { conversations } from "@/lib/db/schema";
import { saveContactFacts } from "@/lib/agent/customer/profile";
import type { AgentTool } from "../types";

const schema = z.object({ campos: z.record(z.string(), z.union([z.string(), z.number()])) });

export const recopilarDatos: AgentTool = {
  name: "recopilar_datos",
  description: "Guarda en la ficha del cliente los datos que proporcione (nombre, ciudad, email, empresa, o cualquier dato útil como preferencias o segmento).",
  paramsSchema: schema,
  jsonSchema: { type: "object", properties: { campos: { type: "object" } }, required: ["campos"] },
  async run(args, ctx) {
    const { campos } = schema.parse(args);
    const [conv] = await ctx.db.select({ contactId: conversations.contactId }).from(conversations).where(eq(conversations.id, ctx.conversationId));
    if (conv?.contactId) await saveContactFacts(ctx.db, ctx.orgId, conv.contactId, campos);
    return { ok: true, data: { guardados: Object.keys(campos) } };
  },
};
```
(Verifica que la firma `run(args, ctx)` y `ToolContext` coinciden; el archivo hoy usa `run(args)`.) Añade un test a `recopilar-datos.test.ts` (o créalo): con makeTestDb + una conversación con contactId, `run` persiste los campos en el contacto.

- [ ] **Step 5: Run green** + tsc. Commit `feat(agent): recopilar_datos persiste en la ficha del cliente`.

---

## Task 3: `buildCustomerProfile`

**Files:** Modify `src/lib/agent/customer/profile.ts`; Test `src/lib/agent/customer/profile.test.ts`.

- [ ] **Step 1: Write failing test** (añade a profile.test.ts; seed org+contact+conversación(contactId)+1 pedido):
```ts
import { conversations, orders } from "@/lib/db/schema";
import { buildCustomerProfile } from "./profile";
it("arma la ficha desde contacto + pedidos", async () => {
  const { db } = makeTestDb(); await seed(db);
  await saveContactFacts(db, "o1", "c1", { nombre: "Ana", segmento: "mayorista" });
  await db.insert(conversations).values({ id: "cv1", orgId: "o1", phone: "57300", status: "open", unreadCount: 0, lastMessageAt: new Date(), createdAt: new Date(), contactId: "c1" }).onConflictDoNothing();
  await db.insert(orders).values({ id: "ord_ABC123", orgId: "o1", contactId: "c1", itemsJson: "[]", totalCop: 99000, status: "pagado", paymentMethod: "Nequi", shippingAddressJson: JSON.stringify({ direccion: "Cl 1 #2-3", ciudad: "Cali" }), createdAt: new Date() }).onConflictDoNothing();
  const ficha = await buildCustomerProfile(db, "o1", "cv1");
  expect(ficha).toContain("Ana");
  expect(ficha).toContain("mayorista");
  expect(ficha).toContain("Cali");
  expect(ficha).toContain("Nequi");
  expect(ficha.toUpperCase()).toContain("ABC123");
});
it("ficha vacía si la conversación no tiene contacto", async () => {
  const { db } = makeTestDb(); await seed(db);
  await db.insert(conversations).values({ id: "cv2", orgId: "o1", phone: "57301", status: "open", unreadCount: 0, lastMessageAt: new Date(), createdAt: new Date() }).onConflictDoNothing();
  expect(await buildCustomerProfile(db, "o1", "cv2")).toBe("");
});
```
(Ajusta las columnas del insert de `conversations`/`orders` a las REALES del schema.)

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implementación** — añade a `profile.ts`:
```ts
export async function buildCustomerProfile(db: DB, orgId: string, conversationId: string): Promise<string> {
  const [conv] = await db.select({ contactId: conversations.contactId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
  if (!conv?.contactId) return "";
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, conv.contactId), eq(contacts.orgId, orgId)));
  if (!c) return "";
  const lines: string[] = [];
  const datos = [c.name && `nombre: ${c.name}`, c.city && `ciudad: ${c.city}`, c.email && `email: ${c.email}`, c.company && `empresa: ${c.company}`, c.notes && `notas: ${c.notes}`].filter(Boolean) as string[];
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(c.dataJson ?? "{}"); } catch { data = {}; }
  for (const [k, v] of Object.entries(data)) datos.push(`${k}: ${v}`);
  if (datos.length) lines.push("Cliente: " + datos.join(" · "));

  const ords = await db.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.contactId, conv.contactId))).orderBy(desc(orders.createdAt)).limit(5);
  const addrs: string[] = [];
  for (const o of ords) {
    if (!o.shippingAddressJson) continue;
    try { const a = JSON.parse(o.shippingAddressJson) as Record<string, string>; const t = [a.direccion, a.ciudad].filter(Boolean).join(", "); if (t && !addrs.includes(t)) addrs.push(t); } catch {}
  }
  if (addrs.length) lines.push("Direcciones conocidas: " + addrs.slice(0, 3).join(" | "));
  const pays = ords.map((o) => o.paymentMethod).filter(Boolean) as string[];
  if (pays.length) lines.push("Medio de pago habitual: " + pays[0]);
  if (ords.length) {
    lines.push("Pedidos recientes: " + ords.map((o) => `#${o.id.slice(-6).toUpperCase()} ($${o.totalCop.toLocaleString("es-CO")}, ${o.status})`).join(", "));
  }
  const block = lines.join("\n");
  return block.length > 1500 ? block.slice(0, 1497) + "…" : block;
}
```

- [ ] **Step 4: Run green** + tsc. Commit `feat(agent): buildCustomerProfile (ficha desde contacto + pedidos)`.

---

## Task 4: Inyectar la ficha + reducir el window

**Files:** Modify `src/lib/agent/context.ts`, `src/lib/agent/turn.ts`; Test `src/lib/agent/context.test.ts` (si existe).

- [ ] **Step 1: `buildSystemPrompt` gana `customerProfile`.** En `context.ts`:
```ts
export function buildSystemPrompt(config: {
  name: string;
  systemPrompt: string;
  knowledge?: string;
  customerProfile?: string;
}): string {
  let out = `Eres ${config.name}, un asistente de WhatsApp.\n\n${config.systemPrompt}\n\n${GLOBAL_RULES}`;
  if (config.customerProfile && config.customerProfile.trim()) {
    out += `\n\n## Ficha del cliente (lo que ya sabemos — úsala, no vuelvas a preguntar lo que ya está):\n${config.customerProfile.trim()}`;
  }
  if (config.knowledge && config.knowledge.trim()) {
    out += `\n\nInformación de la empresa (úsala para responder; si la respuesta no está aquí, dilo o escala, no inventes):\n${config.knowledge.trim()}`;
  }
  return out;
}
```
Test (si hay context.test.ts, añade; si no, créalo): `buildSystemPrompt` incluye la sección de ficha cuando se pasa `customerProfile`, y no cuando está vacío.

- [ ] **Step 2: turn.ts** — `HISTORY_LIMIT` configurable y a 10:
```ts
const HISTORY_LIMIT = Number(process.env.AGENT_HISTORY_LIMIT ?? 10);
```
y construir + pasar la ficha. Junto al bloque del RAG (donde calcula `knowledge`), añade:
```ts
  let customerProfile = "";
  try { customerProfile = await buildCustomerProfile(db, orgId, conversationId); } catch { customerProfile = ""; }
```
(import `buildCustomerProfile` de `./customer/profile`.) Y en la llamada a `buildSystemPrompt({ name, systemPrompt, knowledge })` añade `customerProfile`.

- [ ] **Step 3: Run** `bunx vitest run src/lib/agent/` + `bunx tsc --noEmit`. Commit `feat(agent): inyecta la ficha del cliente y reduce el window de history a 10`.

---

## Task 5: Verificación final + en vivo

- [ ] **Step 1:** `find .next/types -name "* 2.ts" -delete; bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build` → verde/pasa.
- [ ] **Step 2:** Merge a `main`, deploy (`bash deploy/deploy.sh`, migración aditiva, health 200). UN solo deploy.
- [ ] **Step 3 (en vivo, org 49644ae3):** por WhatsApp decir "soy mayorista, mi nombre es X, envíen a <dirección>" → el agente guarda; en un turno posterior (más de 10 mensajes después) preguntar algo que dependa de eso → el agente lo "recuerda" desde la ficha sin re-preguntar. Verificar en `/contactos/[id]` que los datos quedaron guardados.

---

## Self-Review (cobertura del spec)

- **Comp.1 data_json:** Task 1. ✓
- **Comp.2 tool persiste:** Task 2 (saveContactFacts + recopilar_datos). ✓
- **Comp.3 buildCustomerProfile:** Task 3. ✓
- **Comp.4 inyección:** Task 4 (buildSystemPrompt + turn.ts). ✓
- **Comp.5 menos transcript:** Task 4 (HISTORY_LIMIT 10 configurable). ✓
- **Migración aditiva:** Task 1. ✓
- **Tipos:** `saveContactFacts(db,orgId,contactId,campos)` (Task2) usado por recopilar_datos; `buildCustomerProfile(db,orgId,conversationId)→string` (Task3) usado por turn.ts; `buildSystemPrompt({...customerProfile})` (Task4). ✓
- **Robustez:** safeParse de data_json/shipping; no rompe sin contacto; try/catch en turn (igual que RAG). ✓
