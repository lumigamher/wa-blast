# Agente IA — Plan F: Medios de pago manuales + comprobante (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox.

**Goal:** Que el agente presente los **medios de pago** configurados por la org (Nequi, Daviplata, Bre-B, transferencia, link abierto) y registre el **pago de un pedido** con su **comprobante** (la foto que el cliente manda por WhatsApp se enlaza al pedido).

**Architecture:** Tabla `payment_methods` por org (CRUD en panel). Tool `medios_de_pago` los presenta. Tool `registrar_pago` enlaza el último mensaje entrante con imagen (comprobante) al pedido y lo marca pagado. Reusa `orders` (campos `paymentMethod`, `comprobanteMediaId`, `status` ya existen del Plan E).

**Tech Stack:** TS, Drizzle(sqlite), Vitest. Reusa: `messages` (inbound mediaId), `orders`.

**Decisión (Luis):** medios manuales + comprobante por imagen ("mucha gente paga por Bre-B/Nequi/Daviplata/transferencia").

---

## File Structure
- `domain.ts` (MOD) — tabla `paymentMethods`.
- `src/lib/agent/payments/methods.ts` — list/CRUD helpers.
- `src/lib/agent/payments/register.ts` — `registrarPago` (enlaza comprobante + marca pedido).
- `src/lib/agent/tools/builtin/{medios-de-pago,registrar-pago}.ts` + registro.
- `admin.ts` (MOD) + actions + `_payments.tsx` (panel) + render.

---

### Task 1: Schema `payment_methods`
**Files:** `domain.ts`. Tras `agentCatalog`:
```ts
export const paymentMethods = sqliteTable(
  "payment_methods",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["nequi", "daviplata", "bre_b", "transferencia", "link"],
    }).notNull(),
    label: text("label").notNull(),
    // Instrucciones/datos: número, cuenta, llave Bre-B, o URL del link.
    details: text("details").notNull().default(""),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("payment_methods_org_idx").on(t.orgId) }),
);
```
- [ ] `db:generate` → 0018 (verifica solo esta tabla; migrate fresco OK). tsc clean. **commit** `feat(agent): schema payment_methods`

---

### Task 2: Helpers de métodos + register (con tests)
**Files:** `src/lib/agent/payments/methods.ts` + `register.ts` + tests.

`methods.ts`:
```ts
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { paymentMethods } from "@/lib/db/schema";

export type PaymentType = "nequi" | "daviplata" | "bre_b" | "transferencia" | "link";

export async function listPaymentMethods(db: DB, orgId: string, onlyEnabled = false) {
  const rows = await db.select().from(paymentMethods).where(eq(paymentMethods.orgId, orgId)).orderBy(asc(paymentMethods.sortOrder));
  return onlyEnabled ? rows.filter((r) => r.enabled) : rows;
}

export async function addPaymentMethod(db: DB, orgId: string, input: { type: PaymentType; label: string; details: string }): Promise<void> {
  if (!input.label.trim()) throw new Error("Etiqueta requerida");
  await db.insert(paymentMethods).values({ id: randomUUID(), orgId, type: input.type, label: input.label.trim(), details: input.details ?? "", enabled: true, sortOrder: 0, createdAt: new Date() });
}

export async function setPaymentMethodEnabled(db: DB, orgId: string, id: string, enabled: boolean): Promise<void> {
  await db.update(paymentMethods).set({ enabled }).where(and(eq(paymentMethods.id, id), eq(paymentMethods.orgId, orgId)));
}

export async function deletePaymentMethod(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.orgId, orgId)));
}
```
`register.ts`:
```ts
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { messages, orders } from "@/lib/db/schema";

/** mediaId del último mensaje entrante con imagen en la conversación (comprobante). */
export async function lastInboundMediaId(db: DB, conversationId: string): Promise<string | null> {
  const row = (
    await db
      .select({ mediaId: messages.mediaId })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "in"), isNotNull(messages.mediaId)))
      .orderBy(desc(messages.createdAt))
      .limit(1)
  )[0];
  return row?.mediaId ?? null;
}

/** Marca un pedido como pagado, enlazando el comprobante (última imagen entrante). */
export async function registrarPago(
  db: DB,
  input: { orgId: string; conversationId: string; orderId?: string; medioDePago: string },
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  // Resuelve el pedido: el dado, o el último "pendiente" de la conversación.
  let orderId = input.orderId;
  if (!orderId) {
    const o = (
      await db.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.orgId, input.orgId), eq(orders.conversationId, input.conversationId), eq(orders.status, "pendiente")))
        .orderBy(desc(orders.createdAt)).limit(1)
    )[0];
    if (!o) return { ok: false, error: "No hay un pedido pendiente en esta conversación" };
    orderId = o.id;
  }
  const comprobanteMediaId = await lastInboundMediaId(db, input.conversationId);
  await db.update(orders)
    .set({ status: "pagado", paymentMethod: input.medioDePago, comprobanteMediaId })
    .where(and(eq(orders.id, orderId), eq(orders.orgId, input.orgId)));
  return { ok: true, orderId };
}
```
- [ ] TDD: addPaymentMethod/list/toggle/delete; registrarPago marca pagado + enlaza la última imagen entrante (sembrar conversación + pedido pendiente + 1 mensaje in con mediaId); sin pedido pendiente → ok:false. tsc clean. **commit** `feat(agent): helpers de medios de pago + registrarPago (comprobante)`

---

### Task 3: Tools `medios_de_pago` y `registrar_pago`
**Files:** 2 tools + tests; registro en `registry.ts`.
- `medios_de_pago()`: `listPaymentMethods(ctx.db, ctx.orgId, true)` → `{ ok:true, data:{ metodos: [{type,label,details}] } }`. Description: presentar los medios al cliente con sus datos.
- `registrar_pago({ medioDePago: string, orderId?: string })`: `registrarPago(...)` → ToolResult. Description: usar cuando el cliente confirma que pagó y mandó el comprobante.
- [ ] TDD + registrar en BUILTIN_TOOLS + tsc + lint. **commit** `feat(agent): tools medios_de_pago y registrar_pago`

---

### Task 4: Panel — Medios de pago
**Files:** admin helpers ya en methods.ts; actions (`addPaymentMethodAction`, `togglePaymentMethodAction`, `deletePaymentMethodAction`) + `_payments.tsx` (lista + agregar: type select, label, details; toggle; eliminar) + render en `page.tsx` (cargar `listPaymentMethods`).
- [ ] UI client + acciones + tsc + lint + build. **commit** `feat(agent): panel — sección Medios de pago`

---

### Task 5: Gauntlet + (controller) review + merge + deploy
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` verde.

---

## Self-Review
- Comprobante: enlaza la ÚLTIMA imagen entrante de la conversación (asume que el cliente la mandó justo antes de confirmar). Si no hay imagen, `comprobanteMediaId` queda null pero el pedido se marca pagado igual (el medio puede no requerir comprobante, p.ej. efectivo). Aceptable v1.
- Multi-tenant: todo por orgId; registrarPago filtra orgId en el update.
- Pedido pendiente: registrar_pago sin orderId toma el último pendiente de la conversación.
- Siguiente: G (pasarela EfiPay: link personalizado con monto del pedido + confirmación por webhook → marca pagado automático), H (Flow de pago).
