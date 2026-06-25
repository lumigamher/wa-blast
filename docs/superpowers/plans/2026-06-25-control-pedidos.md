# Control de pedidos (anti-duplicados + número consecutivo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `crear_pedido` reuse el pedido pendiente de la conversación (no duplique) y que los pedidos tengan número consecutivo por org, mostrado como #N.

**Architecture:** `createOrder` reusa el último pedido si está `pendiente`; si no, crea uno nuevo con `numero = max(org)+1`. Migración aditiva `orders.numero` + backfill. `crear_pedido` y el panel/Rappi muestran `#numero`.

**Tech Stack:** TypeScript, Drizzle (bun:sqlite), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-25-control-pedidos-design.md`

**Convenciones:** tests `bunx vitest run <ruta>`; typecheck `bunx tsc --noEmit`; migración `bun run db:generate`+`bun run db:migrate`. Commits terminan `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Hechos verificados:**
- `createOrder(db, input, provider)` (`catalog/orders.ts`): resuelve items+total e inserta SIEMPRE; retorna `{orderId, totalCop, items}`. `CreateOrderResult` (línea ~41).
- `getLatestOrderForConversation(db, orgId, conversationId)` → último pedido o null.
- `orders`: id, orgId, conversationId, contactId, itemsJson, totalCop, status enum `pendiente|confirmado|pagado|cancelado`, createdAt.
- `crear-pedido.ts` arma `{orderId, numeroCorto, items, totalCop, siguientePaso}` (lee `getOrder`).
- `OrderListItem`/`listOrders` (lista), `getOrder` (detalle Rappi).

---

## Task 1: Migración `orders.numero` + backfill

**Files:** Modify `src/lib/db/schema/domain.ts`; migración en `drizzle/`.

- [ ] **Step 1:** En `domain.ts`, en la tabla `orders`, añade tras `totalCop`:
```ts
    numero: integer("numero"),
```
- [ ] **Step 2:** `bun run db:generate`. Luego **edita el `.sql` generado** y añade al final el backfill (consecutivo por org por fecha):
```sql
--> statement-breakpoint
UPDATE `orders` SET `numero` = (
  SELECT COUNT(*) FROM `orders` o2
  WHERE o2.`org_id` = `orders`.`org_id` AND (o2.`created_at` < `orders`.`created_at` OR (o2.`created_at` = `orders`.`created_at` AND o2.`id` <= `orders`.`id`))
) WHERE `numero` IS NULL;
```
(SQLite no siempre tiene ROW_NUMBER en migraciones; este COUNT correlacionado asigna 1..N por org ordenado por created_at, desempatando por id.)
- [ ] **Step 3:** `bun run db:migrate` (verifica que aplica sin error y que añade columna + backfill, sin DROP de otras tablas). `bunx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(db): orders.numero (consecutivo por org) + backfill`.

---

## Task 2: `createOrder` reusa pendiente + `nextOrderNumber` + numero en el result

**Files:** Modify `src/lib/agent/catalog/orders.ts`; Test `src/lib/agent/catalog/orders.test.ts`.

- [ ] **Step 1: Write failing test** (makeTestDb + seed org/contacto/conversación; provider mock que devuelve un producto con precio fijo — sigue cómo el test actual mockea el provider/createOrder):
```ts
it("reusa el pedido pendiente en vez de duplicar", async () => {
  // crear_pedido 1: crea pedido con numero 1, status pendiente
  const r1 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 1 }] }, provider);
  // crear_pedido 2 (misma conversación, sigue pendiente): actualiza el mismo
  const r2 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 3 }] }, provider);
  expect(r2.orderId).toBe(r1.orderId);
  expect(r2.numero).toBe(r1.numero);
  const all = await listOrders(db, "o1", {});
  expect(all.length).toBe(1);
  expect(all[0].totalCop).toBe(r2.totalCop); // refleja la 2da (3 unidades)
});
it("crea pedido nuevo (numero+1) si el último ya no está pendiente", async () => {
  const r1 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 1 }] }, provider);
  await updateOrderStatus(db, "o1", r1.orderId, "pagado");
  const r2 = await createOrder(db, { orgId: "o1", conversationId: "cv1", items: [{ productId: "p1", cantidad: 1 }] }, provider);
  expect(r2.orderId).not.toBe(r1.orderId);
  expect(r2.numero).toBe((r1.numero ?? 0) + 1);
});
```
(Ajusta el mock del `provider` y los inserts de seed a lo real del archivo de test.)

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implementación** en `orders.ts`:
1. `CreateOrderResult` (tipo) gana `numero: number;`.
2. Helper privado:
```ts
async function nextOrderNumber(db: DB, orgId: string): Promise<number> {
  const [r] = await db.select({ max: sql<number>`coalesce(max(${orders.numero}), 0)` }).from(orders).where(eq(orders.orgId, orgId));
  return (r?.max ?? 0) + 1;
}
```
(import `sql` de drizzle-orm.)
3. En `createOrder`, tras calcular `resolvedItems`+`totalCop`, antes del insert:
```ts
  const now = new Date();
  // Anti-duplicados: reusar el pedido pendiente de la conversación.
  if (input.conversationId) {
    const latest = await getLatestOrderForConversation(db, input.orgId, input.conversationId);
    if (latest && latest.status === "pendiente") {
      await db.update(orders).set({ itemsJson: JSON.stringify(resolvedItems), totalCop }).where(eq(orders.id, latest.id));
      return { orderId: latest.id, numero: latest.numero ?? 0, totalCop, items: resolvedItems };
    }
  }
  const orderId = randomUUID();
  const numero = await nextOrderNumber(db, input.orgId);
  await db.insert(orders).values({
    id: orderId, orgId: input.orgId, conversationId: input.conversationId ?? null,
    contactId: input.contactId ?? null, itemsJson: JSON.stringify(resolvedItems),
    totalCop, numero, createdAt: now,
  });
  return { orderId, numero, totalCop, items: resolvedItems };
```
(Elimina el insert/return viejo.)

- [ ] **Step 4: Run green** + tsc. Commit `feat(orders): reusar pedido pendiente + número consecutivo en createOrder`.

---

## Task 3: Usar `#numero` en crear_pedido + lista/detalle

**Files:** Modify `src/lib/agent/tools/builtin/crear-pedido.ts`; `src/lib/agent/catalog/orders.ts` (OrderListItem + listOrders); `src/app/(app)/pedidos/@detail/[id]/_detail.tsx` y `pedidos/_components/orders-list-pane.tsx`.

- [ ] **Step 1: crear_pedido expone numero.** En `crear-pedido.ts`, el `result` de `createOrder` ahora trae `numero`. Cambia el resumen para usarlo: `numero: result.numero` (mantén `numeroCorto` si quieres, pero añade `numero`). Ajusta su test si valida el shape.
- [ ] **Step 2: OrderListItem + listOrders.** Añade `numero: number | null;` a `OrderListItem` y `numero: orders.numero,` al `.select({...})` de `listOrders`. Ajusta su test.
- [ ] **Step 3: Mostrar #N.** En `pedidos/_components/orders-list-pane.tsx` (fila) y `pedidos/@detail/[id]/_detail.tsx` (header), muestra `#${o.numero ?? "—"}` como número del pedido (antes se usaba el slice del id). Usa el `numero` que ahora viene en el item/detalle (el detalle usa `getOrder` → confirma que devuelve `numero`; si no, añádelo al select de getOrder).
- [ ] **Step 4:** `bunx tsc --noEmit && bun run build`. Commit `feat(pedidos): mostrar #numero en confirmación, lista y detalle`.

---

## Task 4: Verificación final + en vivo

- [ ] **Step 1:** `find .next/types -name "* 2.ts" -delete; bun run lint && bunx tsc --noEmit && bunx vitest run src/lib/agent/ && bun run build` → verde/pasa.
- [ ] **Step 2:** Merge a `main`, deploy (`bash deploy/deploy.sh`, migración aditiva+backfill, health 200). UN solo deploy.
- [ ] **Step 3 (en vivo, org 49644ae3):** pedir lo mismo 2 veces seguidas → **un solo pedido** (no 3); el agente confirma "Pedido #N"; en `/pedidos` los números son consecutivos; cerrar uno (pagado) y pedir de nuevo → pedido nuevo con #N+1.

---

## Self-Review (cobertura del spec)

- **Comp.1 anti-duplicados:** Task 2 (reuse pendiente en createOrder). ✓
- **Comp.2 número consecutivo:** Task 1 (columna+backfill) + Task 2 (nextOrderNumber). ✓
- **Comp.3 mostrar #numero:** Task 3 (crear_pedido + lista + detalle). ✓
- **Migración aditiva + backfill:** Task 1. ✓
- **Tipos:** `CreateOrderResult.numero` (Task2) usado por crear_pedido (Task3); `OrderListItem.numero` (Task3) usado por la lista; `nextOrderNumber` privado. ✓
- **Robustez:** reuse solo si `pendiente`; numero null-safe en UI. ✓
