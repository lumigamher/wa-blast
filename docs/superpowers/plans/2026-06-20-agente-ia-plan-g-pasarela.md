# Agente IA — Plan G: Pasarela de pago (EfiPay links) (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Que el agente genere un **link de pago personalizado** (EfiPay) con el **monto exacto del pedido**, lo envíe por WhatsApp, y que al confirmarse el pago el **webhook marque el pedido como pagado** automáticamente.

**Architecture:** Reusa `createCheckout` de EfiPay (ya usado para suscripciones). Nueva tabla `order_payments` (transactionId → orderId). Tool `generar_link_pago` crea el checkout con `reference=orderId`. El webhook EfiPay, además de suscripciones (`billingCheckouts`), revisa `order_payments` y marca el pedido `pagado`.

**Tech Stack:** TS, Drizzle(sqlite), Vitest. Reusa `src/lib/billing/efipay.ts` (`createCheckout(creds, {amountCop, description, webhookUrl, returnUrl, reference})` → `{checkoutUrl, transactionId}`, `efipayCredsFromEnv()`), `src/lib/billing/efipay-webhook.ts`, `orders`, `env` (PUBLIC_BASE_URL ?? BETTER_AUTH_URL).

**Nota:** las credenciales EfiPay son a nivel de entorno (global), no por org (igual que las suscripciones). Si no están configuradas, la tool devuelve ok:false con mensaje claro.

---

## File Structure
- `domain.ts` (MOD) — tabla `orderPayments`.
- `src/lib/agent/payments/link.ts` — `generarLinkPago` + `markOrderPaidByCheckout`.
- `src/lib/agent/tools/builtin/generar-link-pago.ts` + registro.
- `src/lib/billing/efipay-webhook.ts` (MOD) — además de suscripción, resolver pago de pedido.

---

### Task 1: Schema `order_payments`
**Files:** `domain.ts` (tras `paymentMethods`):
```ts
export const orderPayments = sqliteTable(
  "order_payments",
  {
    id: text("id").primaryKey(), // = transactionId de EfiPay
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    amountCop: integer("amount_cop").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orderIdx: index("order_payments_order_idx").on(t.orderId) }),
);
```
- [ ] `db:generate` → 0019 (solo esta tabla; migrate fresco). tsc clean. **commit** `feat(agent): schema order_payments`

---

### Task 2: `link.ts` — generar link + marcar pagado
**Files:** `src/lib/agent/payments/link.ts` + test.

```ts
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { createCheckout, efipayCredsFromEnv } from "@/lib/billing/efipay";
import type { DB } from "@/lib/db/client";
import { orderPayments, orders } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function generarLinkPago(
  db: DB,
  input: { orgId: string; conversationId: string; orderId?: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Resuelve pedido (dado o último pendiente de la conversación).
  let order = input.orderId
    ? (await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.orgId, input.orgId))))[0]
    : (await db.select().from(orders)
        .where(and(eq(orders.orgId, input.orgId), eq(orders.conversationId, input.conversationId), eq(orders.status, "pendiente")))
        .orderBy(desc(orders.createdAt)).limit(1))[0];
  if (!order) return { ok: false, error: "No hay un pedido para cobrar" };

  const creds = efipayCredsFromEnv();
  if (!creds) return { ok: false, error: "Pagos en línea no configurados" };

  const base = env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL;
  try {
    const res = await createCheckout(creds, {
      amountCop: order.totalCop,
      description: `Pedido ${order.id.slice(0, 8)}`,
      webhookUrl: `${base}/api/webhook/efipay`,
      returnUrl: `${base}/`,
      reference: order.id,
    });
    await db.insert(orderPayments).values({ id: res.transactionId, orgId: input.orgId, orderId: order.id, amountCop: order.totalCop, createdAt: new Date() });
    return { ok: true, url: res.checkoutUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error creando el link" };
  }
}

/** Llamado desde el webhook: si el checkout corresponde a un pedido, lo marca pagado. */
export async function markOrderPaidByCheckout(db: DB, candidateIds: string[]): Promise<boolean> {
  for (const id of candidateIds) {
    const op = (await db.select().from(orderPayments).where(eq(orderPayments.id, id)))[0];
    if (op) {
      await db.update(orders).set({ status: "pagado", paymentMethod: "EfiPay" }).where(eq(orders.id, op.orderId));
      return true;
    }
  }
  return false;
}
```
- [ ] TDD: generarLinkPago con `createCheckout` mockeado (vi.mock o inyección)... como `createCheckout` se importa, mockear `globalThis.fetch` que usa createCheckout, O mejor: testear `markOrderPaidByCheckout` (sembrar order_payments + order, llamar con el id → order pagado) y testear la rama "sin pedido → ok:false" / "sin creds → ok:false" (sin env EfiPay, efipayCredsFromEnv devuelve null). Para generarLinkPago feliz, mockear fetch con la respuesta de EfiPay (`{url, payment_id}`). tsc clean. **commit** `feat(agent): generarLinkPago + markOrderPaidByCheckout (EfiPay pedidos)`

---

### Task 3: Tool `generar_link_pago` + webhook
**Files:** tool + test + registro; `efipay-webhook.ts` (MOD).
- Tool `generar_link_pago({ orderId?: string })`: `generarLinkPago(ctx.db, {orgId, conversationId, orderId})` → si ok, `{ ok:true, data:{ url } }`. Description: "Genera un link de pago en línea con el total del pedido y devuélvelo para enviárselo al cliente."
- Webhook: en `handleEfipayWebhook`, tras (o antes de) resolver `billingCheckouts`, llamar `markOrderPaidByCheckout(db, event.candidateIds)`; si marca un pedido, devolver 200 (no romper el flujo de suscripciones — intentar ambos: si no es checkout de suscripción, probar pedido). Mantener idempotencia/200-ack.
- [ ] TDD (tool con generarLinkPago; webhook: simular evento aprobado con un order_payment sembrado → order pagado) + registrar en BUILTIN_TOOLS + tsc + lint. **commit** `feat(agent): tool generar_link_pago + webhook marca pedido pagado`

---

### Task 4: Gauntlet + merge + deploy
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` verde.

---

## Self-Review
- EfiPay global (no por org) — documentado; sin creds → ok:false claro.
- Webhook: revisa suscripción Y pedido; idempotente; 200-ack siempre.
- `reference=orderId` + `order_payments.id=transactionId` permiten match en el webhook por candidateIds (igual que suscripciones).
- Multi-tenant: order_payments por orgId; markOrderPaidByCheckout actualiza por orderId (que vino de un order_payment con orgId).
- Riesgo: EfiPay creds no están en prod aún (sabido) → la tool dirá "pagos en línea no configurados" hasta que se pongan. El resto (manual + comprobante) ya funciona.

## Siguiente
Plan H (Flow de pago): mostrar el cobro/resumen del pedido dentro de un WhatsApp Flow.
