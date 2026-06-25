# Pedidos estilo Rappi + confirmación de pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente confirme el pedido al cliente (A) y que `/pedidos` sea maestro-detalle estilo Rappi (lista + detalle con toda la info del cliente, sin recargar la lista) (B).

**Architecture:** A enriquece el `result` de `crear_pedido` + su descripción + la persona. B reestructura `/pedidos` a Next.js Parallel Routes (igual que el inbox): `@list` cliente persistente + `@detail` que swapea, full-bleed.

**Tech Stack:** Next.js 15 (App Router, parallel routes), TypeScript, Drizzle, Vitest, shadcn/ui (button/select), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-25-pedidos-rappi-confirmacion-design.md`

**Convenciones:** tests `bunx vitest run <ruta>`; typecheck `bunx tsc --noEmit` (borra `.next/types/* 2.ts` si molesta); lint `bun run lint`; build `bun run build` (cliente sin SDK). **NO emojis en UI** (iconos lucide). Commits terminan `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Hechos verificados:**
- `crear-pedido.ts:77` → `return { ok:true, data:{ orderId: result.orderId, totalCop: result.totalCop } }`. `getOrder(db, orgId, id)` devuelve el pedido con items resueltos.
- `orders.ts`: `OrderStatus="pendiente"|"confirmado"|"pagado"|"cancelado"`; `OrderListItem`; `listOrders(db,orgId,{status?,limit?,offset?})`, `countOrders(db,orgId,{status?})`, `getOrder(db,orgId,id)`.
- `/pedidos`: `page.tsx` (carga listOrders+countOrders → `OrdersList` de `_orders.tsx`), `[id]/page.tsx` + `[id]/_detail.tsx` (detalle), `actions.ts` (`updateOrderStatusAction(id,status)`, `setOrderDispatchedAction(id,dispatched)`).
- Patrón maestro-detalle ya hecho en inbox: `inbox/layout.tsx`→`InboxShell`(client usePathname) + `@list/default.tsx` + `@detail/{default,[id]/page}.tsx` + `inbox/{page,default}.tsx`=null + `_components/app-content.tsx` (full-bleed si `pathname.startsWith("/inbox")`).

---

## Task 1: A — Confirmación de pedido (crear_pedido)

**Files:** Modify `src/lib/agent/tools/builtin/crear-pedido.ts`; Modify `src/app/(app)/configuracion/agente/_form.tsx` (PRESETS.ventas); Test `src/lib/agent/tools/builtin/crear-pedido.test.ts`.

- [ ] **Step 1: Write/extend the failing test** en `crear-pedido.test.ts` (lee cómo el archivo mockea catálogo/createOrder; sigue ese patrón). Verifica que el result de éxito incluye los campos nuevos:
```ts
// tras un crear_pedido exitoso de 1 producto:
expect(res.ok).toBe(true);
if (res.ok) {
  expect(res.data).toMatchObject({ orderId: expect.any(String), totalCop: expect.any(Number) });
  expect(typeof (res.data as any).numeroCorto).toBe("string");
  expect(Array.isArray((res.data as any).items)).toBe(true);
  expect((res.data as any).items[0]).toMatchObject({ nombre: expect.any(String), cantidad: expect.any(Number) });
  expect(typeof (res.data as any).siguientePaso).toBe("string");
}
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implementación** en `crear-pedido.ts`. Reemplaza el `return { ok:true, data:{ orderId, totalCop } }` por un resumen, leyendo el pedido recién creado con `getOrder` para los items resueltos (import `getOrder` de `../../catalog/orders`):
```ts
      const order = await getOrder(ctx.db, ctx.orgId, result.orderId);
      const items = (order?.items ?? []).map((it: any) => ({
        nombre: it.nombre ?? it.name ?? "",
        variante: it.variantLabel ?? it.variante ?? undefined,
        cantidad: it.cantidad ?? it.qty ?? 1,
        subtotalCop: it.subtotalCop ?? it.subtotal ?? (it.precioCop ?? 0) * (it.cantidad ?? 1),
      }));
      const numeroCorto = result.orderId.slice(-6).toUpperCase();
      return { ok: true, data: { orderId: result.orderId, numeroCorto, items, totalCop: result.totalCop, siguientePaso: "coordinar el pago y la entrega" } };
```
> Ajusta los nombres de campo (`it.nombre`/`it.variantLabel`/etc.) a lo que REALMENTE devuelve `getOrder` (lee `orders.ts` getOrder + el shape de itemsJson — el pedido guarda `variantId`/`variantLabel` en el itemsJson). Si `getOrder` no expone items parseados, parsea `order.itemsJson`.

Y amplía la `description` del tool:
```
"Crea un pedido con los productos que el cliente confirmó. Tras crearlo, CONFÍRMALE al cliente el número de pedido, el resumen de items y el total, y dile el siguiente paso (pago o envío)."
```

- [ ] **Step 4: Persona.** En `src/app/(app)/configuracion/agente/_form.tsx`, en `PRESETS.ventas`, añade al final del texto: " Cuando crees un pedido, confírmaselo SIEMPRE al cliente: número, resumen, total y el siguiente paso."

- [ ] **Step 5: Run green** + `bunx tsc --noEmit`. Commit `feat(agent): crear_pedido devuelve resumen para que el agente confirme el pedido`.

---

## Task 2: B — `/pedidos` estilo Rappi (parallel routes)

**Files:**
- Create: `src/app/(app)/pedidos/layout.tsx`, `pedidos/@list/default.tsx`, `pedidos/@detail/default.tsx`, `pedidos/@detail/[id]/page.tsx`, `pedidos/default.tsx`, `pedidos/_components/orders-list-pane.tsx`
- Modify: `src/app/(app)/pedidos/actions.ts` (server action `getOrdersData`), `pedidos/page.tsx` (→ null), `src/app/(app)/_components/app-content.tsx` (full-bleed para /pedidos)
- Move: `pedidos/[id]/page.tsx` + `pedidos/[id]/_detail.tsx` → `pedidos/@detail/[id]/`

> READ FIRST: `pedidos/page.tsx`, `_orders.tsx`, `[id]/page.tsx`, `[id]/_detail.tsx`, `actions.ts`, y el inbox para el patrón: `inbox/layout.tsx`, `_components/inbox-shell.tsx`, `_components/conversation-list-pane.tsx`, `_components/app-content.tsx`.

- [ ] **Step 1: Server action `getOrdersData`** en `pedidos/actions.ts` (estilo de las actions existentes: `requireOrg`, `db`):
```ts
import { listOrders, countOrders, type OrderStatus } from "@/lib/agent/catalog/orders";
export async function getOrdersData(filters: { status?: OrderStatus; page?: number }) {
  const { orgId } = await requireOrg();
  const page = Math.max(1, filters.page ?? 1);
  const PAGE = 30;
  const orders = await listOrders(db, orgId, { status: filters.status, limit: PAGE, offset: (page - 1) * PAGE });
  const total = await countOrders(db, orgId, { status: filters.status });
  return { orders, total, page, pageSize: PAGE };
}
```

- [ ] **Step 2: `OrdersListPane`** (`pedidos/_components/orders-list-pane.tsx`, `"use client"`, SIN imports de servidor/SDK): lee `?status=` de `useSearchParams`; llama `getOrdersData({status})` en mount + cambio de filtro (useState+useTransition); filtro de estado (segmented sobrio: Todos/Pendiente/Confirmado/Pagado/Cancelado) que setea `router.replace(\`/pedidos?status=...\`, {scroll:false})` preservando el `[id]` abierto; cada fila `<Link href={\`/pedidos/${o.id}\`}>` con cliente (nombre/tel de `OrderListItem`), total formateado (`$${total.toLocaleString("es-CO")}`), badge de estado (color por estado, sin emoji), ciudad/fecha; resalta la fila activa con `usePathname()`. Mantiene scroll. (Mira `OrderListItem` para los campos disponibles.)

- [ ] **Step 3: Slots + shell.**
  - `pedidos/layout.tsx`: clona el patrón de `inbox/layout.tsx` (renderiza un shell con slots `list`+`detail`). Puedes reusar `InboxShell` si su lógica de `usePathname` matchea `/pedidos/.+` — pero hoy hardcodea `/inbox/`. Mejor: crea `pedidos/_components/orders-shell.tsx` (copia de InboxShell con regex `^/pedidos/.+`) y úsalo en el layout. Lista `md:w-[380px]`, detalle `flex-1`, responsive + "←" en móvil.
  - `pedidos/@list/default.tsx` → `<OrdersListPane/>`.
  - `pedidos/@detail/default.tsx` → vacío ("Selecciona un pedido").
  - `pedidos/@detail/[id]/page.tsx` ← MUEVE el contenido de `pedidos/[id]/page.tsx`; MUEVE `pedidos/[id]/_detail.tsx` → `pedidos/@detail/[id]/_detail.tsx` y ajusta el import. Borra los viejos `pedidos/[id]/page.tsx` y `_detail.tsx`. (NO copiar: mover, para no duplicar.)
  - `pedidos/page.tsx` → `export default function Page(){ return null; }`.
  - `pedidos/default.tsx` (NUEVO) → `export default function D(){ return null; }` (children slot para `/pedidos/[id]`).

- [ ] **Step 4: Detalle con toda la info.** En `@detail/[id]/page.tsx` (el `_detail.tsx` movido) confirma que muestra: cliente (nombre+tel), items con variante, total, método de pago + comprobante (imagen `/api/inbox/media/<id>`), **dirección de envío completa** (todos los campos de `shipping_address_json`), cotización (`shipping_quote_json`), estado (dropdown `updateOrderStatusAction`) + despachado (`setOrderDispatchedAction`). Si el `_detail.tsx` actual ya muestra casi todo, solo asegúrate de pintar TODOS los campos de la dirección (no recortar). Mantén el `safeParse` tolerante de los JSON.

- [ ] **Step 5: Full-bleed.** En `src/app/(app)/_components/app-content.tsx`, cambia la condición para incluir `/pedidos`:
```ts
const fullBleed = pathname.startsWith("/inbox") || pathname.startsWith("/pedidos");
```
(usa `fullBleed` donde hoy chequea `/inbox`).

- [ ] **Step 6: Verificar** `find .next/types -name "* 2.ts" -delete; bunx tsc --noEmit && bun run build`. Build DEBE pasar (parallel routes + sin SDK en cliente). Confirma el árbol: `find "src/app/(app)/pedidos" -name "page.tsx" -o -name "default.tsx" -o -name "layout.tsx" | sort` → debe incluir `@detail/[id]/page.tsx`, `@detail/default.tsx`, `@list/default.tsx`, `default.tsx`, `layout.tsx`, `page.tsx`. Verifica que NO quedó `pedidos/[id]/` ni rutas con paréntesis escapados (`src/app/\(app\)/`). Commit `feat(pedidos): vista maestro-detalle estilo Rappi (parallel routes) + full-bleed`.

---

## Task 3: Verificación final + en vivo

- [ ] **Step 1:** `find .next/types -name "* 2.ts" -delete; bun run lint && bunx tsc --noEmit && bunx vitest run src/lib/agent/ && bun run build` → verde/pasa.
- [ ] **Step 2:** Merge a `main`, deploy (`bash deploy/deploy.sh`, sin migración, health 200). UN solo deploy.
- [ ] **Step 3 (en vivo, org 49644ae3):**
  - `/pedidos`: lista a la izquierda, click en un pedido → detalle a la derecha **sin recargar la lista**; filtro por estado persiste; toda la info del cliente visible (dirección completa, items con variante, comprobante, pago, envío); cambiar estado + despachado funciona.
  - Agente: crear un pedido por WhatsApp → el agente **confirma** con número, resumen, total y siguiente paso.

---

## Self-Review (cobertura del spec)

- **A confirmación:** Task 1 (result enriquecido + descripción + persona). ✓
- **B Rappi maestro-detalle:** Task 2 (getOrdersData + OrdersListPane + parallel routes + mover detalle + full-bleed). ✓
- **Sin migración** (no cambia schema). ✓
- **Tipos:** `getOrdersData→{orders,total,page,pageSize}` usado por OrdersListPane; `OrderListItem` de orders.ts; `updateOrderStatusAction/setOrderDispatchedAction` reusadas. ✓
- **GOTCHAS parallel routes** (del inbox): layout no renderiza children; `@list` usa default.tsx; hace falta `pedidos/default.tsx`; MOVER no copiar el detalle; sin paréntesis escapados; build obligatorio. ✓
- **Sin emojis** (badge de estado con colores + lucide). ✓
