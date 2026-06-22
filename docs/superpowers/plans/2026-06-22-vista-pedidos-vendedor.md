# Vista de pedidos para el vendedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página "Pedidos" donde el vendedor ve los pedidos del agente (cliente, total, estado, dirección de despacho, comprobante), edita el estado a mano y marca despachado.

**Architecture:** Capa de datos en `src/lib/agent/catalog/orders.ts` (list/count/get/updateStatus/setDispatched, scoped por orgId, join a conversations/contacts para cliente). Páginas server-component `/pedidos` (lista) y `/pedidos/[id]` (detalle) con server actions. Migración 0025 = `orders.dispatchedAt`.

**Tech Stack:** Next.js 16 (App Router, server components/actions), Drizzle + better-sqlite3, sonner, Vitest.

**Decisiones (spec 2026-06-22):** ver + estados editables + marcar despachado; página top-level gated `agente`; cliente resuelto por join.

---

## File Structure
- `src/lib/db/schema/domain.ts` (MOD): `orders.dispatchedAt`. → migración 0025.
- `src/lib/agent/catalog/orders.ts` (MOD): `listOrders`, `countOrders`, `getOrder`, `updateOrderStatus`, `setOrderDispatched`, helper `parseShippingCity`.
- `src/app/(app)/pedidos/page.tsx` + `_orders.tsx` (NEW): lista.
- `src/app/(app)/pedidos/[id]/page.tsx` + `_detail.tsx` (NEW): detalle.
- `src/app/(app)/pedidos/actions.ts` (NEW): acciones.
- `src/app/(app)/layout.tsx` (MOD): nav "Pedidos". `src/lib/billing/plans.ts` (MOD): `/pedidos` en `MODULE_ROUTES.agente`.

---

## Task 1: Migración dispatchedAt + listOrders/countOrders

**Files:** Modify `src/lib/db/schema/domain.ts`, `src/lib/agent/catalog/orders.ts`; Test `orders.test.ts`; generate migration.

- [ ] **Step 1: Schema + migración**

En `orders` (tras `shippingQuoteJson`): `dispatchedAt: integer("dispatched_at", { mode: "timestamp" }),`
Run `bun run db:generate` → `0025_*.sql` con `ALTER TABLE orders ADD COLUMN dispatched_at`. (iCloud `* 2.sql` → `find drizzle/migrations -name "* 2.*" -delete` si estorba.)

- [ ] **Step 2: Test que falla**

Añade a `src/lib/agent/catalog/orders.test.ts` (reusa su seed):
```ts
import { listOrders, countOrders } from "./orders";
import { contacts, conversations, orders, organization } from "@/lib/db/schema";

describe("listOrders / countOrders", () => {
  it("lista con cliente, filtra por estado y pagina", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(contacts).values({ id: "ct1", orgId: "o1", phone: "57300", name: "Ana", customFields: "{}", createdAt: new Date(), updatedAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "57300", contactId: "ct1", lastMessageAt: new Date(), createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", conversationId: "c1", contactId: "ct1", itemsJson: "[]", totalCop: 1000, status: "pagado", shippingAddressJson: '{"ciudad":"Bogotá"}', createdAt: new Date(Date.now() - 1000) });
    await db.insert(orders).values({ id: "ord2", orgId: "o1", conversationId: "c1", contactId: "ct1", itemsJson: "[]", totalCop: 2000, status: "pendiente", createdAt: new Date() });

    const all = await listOrders(db, "o1");
    expect(all.length).toBe(2);
    expect(all[0].id).toBe("ord2"); // más reciente primero
    const ana = all.find((o) => o.id === "ord1")!;
    expect(ana.contactName).toBe("Ana");
    expect(ana.phone).toBe("57300");
    expect(ana.shippingCity).toBe("Bogotá");

    const pagados = await listOrders(db, "o1", { status: "pagado" });
    expect(pagados.map((o) => o.id)).toEqual(["ord1"]);
    expect(await countOrders(db, "o1")).toBe(2);
    expect(await countOrders(db, "o1", { status: "pagado" })).toBe(1);
    const page = await listOrders(db, "o1", { limit: 1, offset: 0 });
    expect(page.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/orders.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar**

En `orders.ts` añade `count` al import drizzle (`import { and, count, desc, eq } from "drizzle-orm";`) y `conversations, contacts` al import de schema. Añade:
```ts
export type OrderStatus = "pendiente" | "confirmado" | "pagado" | "cancelado";

export type OrderListItem = {
  id: string;
  totalCop: number;
  status: string;
  dispatchedAt: Date | null;
  createdAt: Date;
  phone: string | null;
  contactName: string | null;
  shippingCity: string | null;
};

function parseShippingCity(json: string | null): string | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as { ciudad?: string };
    return v.ciudad ?? null;
  } catch {
    return null;
  }
}

export async function listOrders(
  db: DB,
  orgId: string,
  opts: { status?: OrderStatus; limit?: number; offset?: number } = {},
): Promise<OrderListItem[]> {
  const conds = [eq(orders.orgId, orgId)];
  if (opts.status) conds.push(eq(orders.status, opts.status));
  const base = db
    .select({
      id: orders.id,
      totalCop: orders.totalCop,
      status: orders.status,
      dispatchedAt: orders.dispatchedAt,
      createdAt: orders.createdAt,
      shippingAddressJson: orders.shippingAddressJson,
      phone: conversations.phone,
      contactName: contacts.name,
    })
    .from(orders)
    .leftJoin(conversations, eq(orders.conversationId, conversations.id))
    .leftJoin(contacts, eq(orders.contactId, contacts.id))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt));
  const rows = opts.limit != null ? await base.limit(opts.limit).offset(opts.offset ?? 0) : await base;
  return rows.map((r) => ({
    id: r.id,
    totalCop: r.totalCop,
    status: r.status,
    dispatchedAt: r.dispatchedAt,
    createdAt: r.createdAt,
    phone: r.phone,
    contactName: r.contactName,
    shippingCity: parseShippingCity(r.shippingAddressJson),
  }));
}

export async function countOrders(
  db: DB,
  orgId: string,
  opts: { status?: OrderStatus } = {},
): Promise<number> {
  const conds = [eq(orders.orgId, orgId)];
  if (opts.status) conds.push(eq(orders.status, opts.status));
  const [row] = await db.select({ n: count() }).from(orders).where(and(...conds));
  return row?.n ?? 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/orders.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations src/lib/agent/catalog/orders.ts src/lib/agent/catalog/orders.test.ts
git commit -m "feat(orders): dispatchedAt + listOrders/countOrders with customer join"
```

---

## Task 2: getOrder + updateOrderStatus + setOrderDispatched

**Files:** Modify `src/lib/agent/catalog/orders.ts`; Test `orders.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import { getOrder, updateOrderStatus, setOrderDispatched } from "./orders";

describe("getOrder / updateOrderStatus / setOrderDispatched", () => {
  it("lee, cambia estado y marca despachado, scoped por org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", itemsJson: "[]", totalCop: 1000, status: "pendiente", createdAt: new Date() });

    const got = await getOrder(db, "o1", "ord1");
    expect(got?.id).toBe("ord1");
    expect(await getOrder(db, "o2", "ord1")).toBeNull(); // otra org no ve

    await updateOrderStatus(db, "o1", "ord1", "pagado");
    expect((await getOrder(db, "o1", "ord1"))?.status).toBe("pagado");
    await expect(updateOrderStatus(db, "o1", "ord1", "inexistente" as never)).rejects.toThrow();

    await setOrderDispatched(db, "o1", "ord1", true);
    expect((await getOrder(db, "o1", "ord1"))?.dispatchedAt).toBeTruthy();
    await setOrderDispatched(db, "o1", "ord1", false);
    expect((await getOrder(db, "o1", "ord1"))?.dispatchedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/orders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
const ORDER_STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

export async function getOrder(db: DB, orgId: string, id: string) {
  const [row] = await db
    .select({
      order: orders,
      phone: conversations.phone,
      contactName: contacts.name,
    })
    .from(orders)
    .leftJoin(conversations, eq(orders.conversationId, conversations.id))
    .leftJoin(contacts, eq(orders.contactId, contacts.id))
    .where(and(eq(orders.id, id), eq(orders.orgId, orgId)));
  if (!row) return null;
  return { ...row.order, phone: row.phone, contactName: row.contactName };
}

export async function updateOrderStatus(db: DB, orgId: string, id: string, status: OrderStatus): Promise<void> {
  if (!ORDER_STATUSES.includes(status)) throw new Error("Estado inválido");
  await db.update(orders).set({ status }).where(and(eq(orders.id, id), eq(orders.orgId, orgId)));
}

export async function setOrderDispatched(db: DB, orgId: string, id: string, dispatched: boolean): Promise<void> {
  await db
    .update(orders)
    .set({ dispatchedAt: dispatched ? new Date() : null })
    .where(and(eq(orders.id, id), eq(orders.orgId, orgId)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/catalog/orders.ts src/lib/agent/catalog/orders.test.ts
git commit -m "feat(orders): getOrder + updateOrderStatus + setOrderDispatched"
```

---

## Task 3: Server actions

**Files:** Create `src/app/(app)/pedidos/actions.ts`.

- [ ] **Step 1: Implementar**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { updateOrderStatus, setOrderDispatched, type OrderStatus } from "@/lib/agent/catalog/orders";

export async function updateOrderStatusAction(id: string, status: OrderStatus): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await updateOrderStatus(db, orgId, id, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  return { ok: true };
}

export async function setOrderDispatchedAction(id: string, dispatched: boolean): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setOrderDispatched(db, orgId, id, dispatched);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar + commit**

Run: `bunx tsc --noEmit` → sin errores.
```bash
git add "src/app/(app)/pedidos/actions.ts"
git commit -m "feat(orders): server actions (status + dispatched)"
```

---

## Task 4: Página lista /pedidos

**Files:** Create `src/app/(app)/pedidos/page.tsx`, `src/app/(app)/pedidos/_orders.tsx`.

- [ ] **Step 1: page.tsx**

```tsx
import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { db } from "@/lib/db/client";
import { listOrders, countOrders, type OrderStatus } from "@/lib/agent/catalog/orders";
import { OrdersList } from "./_orders";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireModuleAccess("agente");
  const { orgId } = await requireOrg();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const total = await countOrders(db, orgId, { status });
  const items = await listOrders(db, orgId, { status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <OrdersList
      items={items.map((o) => ({ ...o, createdAt: o.createdAt.getTime(), dispatchedAt: o.dispatchedAt ? o.dispatchedAt.getTime() : null }))}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      status={status ?? ""}
    />
  );
}
```

- [ ] **Step 2: _orders.tsx**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string; totalCop: number; status: string; dispatchedAt: number | null;
  createdAt: number; phone: string | null; contactName: string | null; shippingCity: string | null;
};

const STATUS_CLS: Record<string, string> = {
  pendiente: "text-amber-600", confirmado: "text-blue-600", pagado: "text-emerald-600", cancelado: "text-red-600",
};
const FILTERS = ["", "pendiente", "confirmado", "pagado", "cancelado"];

export function OrdersList({ items, total, page, pageSize, status }: {
  items: Row[]; total: number; page: number; pageSize: number; status: string;
}) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmt = (cop: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);
  const go = (s: string, p: number) => router.push(`/pedidos?status=${s}&page=${p}`);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Pedidos creados por el agente. Edita el estado o marca despachado.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f || "todos"} size="sm" variant={status === f ? "default" : "outline"} onClick={() => go(f, 1)}>
            {f === "" ? "Todos" : f}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{total} pedido{total !== 1 ? "s" : ""}</CardTitle>
          <CardDescription className="text-xs">Página {page} de {totalPages}</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay pedidos.</p>
          ) : (
            <div className="space-y-2">
              {items.map((o) => (
                <Link key={o.id} href={`/pedidos/${o.id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{o.contactName || o.phone || "Sin cliente"}</span>
                      <Badge variant="outline" className={STATUS_CLS[o.status] ?? ""}>{o.status}</Badge>
                      {o.dispatchedAt && <Badge variant="outline" className="text-emerald-600">Despachado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {o.shippingCity ? `${o.shippingCity} · ` : ""}{new Date(o.createdAt).toLocaleDateString("es-CO")}
                    </p>
                  </div>
                  <span className="text-sm font-mono whitespace-nowrap">{fmt(o.totalCop)}</span>
                </Link>
              ))}
            </div>
          )}
          {total > pageSize && (
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => go(status, page - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => go(status, page + 1)}>Siguiente</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verificar + commit**

Run: `bunx tsc --noEmit` + `bun run lint` → limpio.
```bash
git add "src/app/(app)/pedidos/page.tsx" "src/app/(app)/pedidos/_orders.tsx"
git commit -m "feat(orders): página lista /pedidos (filtro estado + paginación)"
```

---

## Task 5: Página detalle /pedidos/[id]

**Files:** Create `src/app/(app)/pedidos/[id]/page.tsx`, `src/app/(app)/pedidos/[id]/_detail.tsx`.

- [ ] **Step 1: page.tsx**

```tsx
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/billing/require-module";
import { db } from "@/lib/db/client";
import { getOrder } from "@/lib/agent/catalog/orders";
import { OrderDetail } from "./_detail";

export const dynamic = "force-dynamic";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("agente");
  const { orgId } = await requireOrg();
  const { id } = await params;
  const order = await getOrder(db, orgId, id);
  if (!order) notFound();

  const items = JSON.parse(order.itemsJson) as Array<{ nombre: string; cantidad: number; subtotal: number; precioUnitario: number }>;
  const address = order.shippingAddressJson ? JSON.parse(order.shippingAddressJson) : null;
  const quote = order.shippingQuoteJson ? JSON.parse(order.shippingQuoteJson) : null;

  return (
    <OrderDetail
      id={order.id}
      status={order.status}
      dispatched={!!order.dispatchedAt}
      totalCop={order.totalCop}
      paymentMethod={order.paymentMethod}
      comprobanteMediaId={order.comprobanteMediaId}
      customer={order.contactName || order.phone || "Sin cliente"}
      items={items}
      address={address}
      quote={quote}
      createdAt={order.createdAt.getTime()}
    />
  );
}
```

- [ ] **Step 2: _detail.tsx**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction, setOrderDispatchedAction } from "../actions";
import type { OrderStatus } from "@/lib/agent/catalog/orders";

const STATUSES: OrderStatus[] = ["pendiente", "confirmado", "pagado", "cancelado"];

type Address = { destinatario?: string; telefono?: string; departamento?: string; ciudad?: string; direccion?: string; barrio?: string; indicaciones?: string };
type Quote = { carrier?: string; priceCop?: number | null; deliveryDays?: number | null };
type Item = { nombre: string; cantidad: number; subtotal: number; precioUnitario: number };

export function OrderDetail({ id, status, dispatched, totalCop, paymentMethod, comprobanteMediaId, customer, items, address, quote, createdAt }: {
  id: string; status: string; dispatched: boolean; totalCop: number; paymentMethod: string | null;
  comprobanteMediaId: string | null; customer: string; items: Item[]; address: Address | null; quote: Quote | null; createdAt: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fmt = (cop: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);

  function changeStatus(s: OrderStatus) {
    start(async () => {
      const r = await updateOrderStatusAction(id, s);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Estado actualizado");
      router.refresh();
    });
  }
  function toggleDispatched() {
    start(async () => {
      const r = await setOrderDispatchedAction(id, !dispatched);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(!dispatched ? "Marcado despachado" : "Despacho deshecho");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/pedidos" className="text-xs text-muted-foreground hover:underline">
        <ArrowLeftIcon className="inline size-3" /> Pedidos
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{customer}</h1>
        <span className="text-lg font-mono">{fmt(totalCop)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{new Date(createdAt).toLocaleString("es-CO")}</p>

      {/* Estado + despacho */}
      <Card>
        <CardHeader><CardTitle className="text-base">Estado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} disabled={pending} onClick={() => changeStatus(s)}>{s}</Button>
            ))}
          </div>
          <Button size="sm" variant={dispatched ? "default" : "outline"} disabled={pending} onClick={toggleDispatched}>
            {dispatched ? "✓ Despachado (deshacer)" : "Marcar despachado"}
          </Button>
          {paymentMethod && <p className="text-xs text-muted-foreground">Pago: {paymentMethod}</p>}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Productos</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{it.cantidad}× {it.nombre}</span>
              <span className="font-mono">{fmt(it.subtotal)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Envío */}
      <Card>
        <CardHeader><CardTitle className="text-base">Envío</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {address ? (
            <>
              <p className="font-medium">{address.destinatario} · {address.telefono}</p>
              <p>{address.direccion}{address.barrio ? `, ${address.barrio}` : ""}</p>
              <p>{address.ciudad}{address.departamento ? `, ${address.departamento}` : ""}</p>
              {address.indicaciones && <p className="text-muted-foreground">{address.indicaciones}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">Sin dirección de despacho.</p>
          )}
          {quote?.carrier && (
            <p className="text-muted-foreground pt-1">
              {quote.carrier}{quote.priceCop != null ? ` · ${fmt(quote.priceCop)}` : ""}{quote.deliveryDays != null ? ` · ${quote.deliveryDays} días` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Comprobante */}
      {comprobanteMediaId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Comprobante</CardTitle></CardHeader>
          <CardContent>
            <img src={`/api/inbox/media/${comprobanteMediaId}`} alt="Comprobante" className="max-h-80 rounded border border-border" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar + commit**

Run: `bunx tsc --noEmit` + `bun run lint` → limpio (warning de `<img>` es preexistente/OK).
```bash
git add "src/app/(app)/pedidos/[id]"
git commit -m "feat(orders): detalle /pedidos/[id] (estado editable + despachado + dirección + comprobante)"
```

---

## Task 6: Sidebar "Pedidos" + gate de ruta

**Files:** Modify `src/app/(app)/layout.tsx`, `src/lib/billing/plans.ts`.

- [ ] **Step 1: MODULE_ROUTES**

En `src/lib/billing/plans.ts`, cambia `agente: ["/configuracion/agente"],` por:
```ts
  agente: ["/configuracion/agente", "/pedidos"],
```

- [ ] **Step 2: Sidebar**

En `src/app/(app)/layout.tsx`: añade `ShoppingBagIcon` al import de lucide-react, y en `STANDALONE_ITEMS` añade tras Inbox:
```ts
  { href: "/pedidos", icon: ShoppingBagIcon, label: "Pedidos", module: "agente" },
```

- [ ] **Step 3: Verificar + commit**

Run: `bunx tsc --noEmit` + `bun run lint` → limpio.
```bash
git add "src/app/(app)/layout.tsx" src/lib/billing/plans.ts
git commit -m "feat(orders): sidebar Pedidos + gate de ruta agente"
```

---

## Task 7: Gauntlet + review + merge + deploy

- [ ] `bunx vitest run` (verde) · `bunx tsc --noEmit` (limpio; `.next/types/* 2.ts` → `find .next/types -name "* 2.ts" -delete`) · `bun run lint` · `bun run build`.
- [ ] Smoke: crear un pedido (o usar uno existente), abrir /pedidos, filtrar por estado, abrir detalle, cambiar estado, marcar despachado, ver dirección/comprobante.
- [ ] `code-reviewer` sobre el diff (foco: multi-tenant en todas las queries, gate de ruta, parseo seguro de JSON).
- [ ] Merge a main + `deploy/deploy.sh` (aplica mig 0025).
- [ ] Actualizar memoria.

---

## Self-Review (cobertura del spec)
- ✅ Lista (cliente/total/estado/ciudad/fecha, filtro estado, paginación) → Task 1 (capa) + Task 4 (UI).
- ✅ Detalle (items/dirección/transportadora/comprobante/método) → Task 2 (getOrder) + Task 5 (UI).
- ✅ Estado editable → Task 2 (updateOrderStatus) + Task 3 (acción) + Task 5 (dropdown).
- ✅ Marcar despachado (dispatchedAt) → Task 1 (mig) + Task 2 (setOrderDispatched) + Task 3 + Task 5.
- ✅ Top-level /pedidos gated agente → Task 4/5 (requireModuleAccess) + Task 6 (sidebar + MODULE_ROUTES).
- ✅ Cliente por join → Task 1 (listOrders) + Task 2 (getOrder).
- ✅ Multi-tenant scoped + tests de aislamiento → Tasks 1–2.
- ✅ JSON null-safe (dirección/quote/items) → Task 5 (parse condicional).

**Consistencia de tipos:** `OrderListItem`, `OrderStatus`, `listOrders(db,orgId,{status?,limit?,offset?})→OrderListItem[]`, `countOrders`, `getOrder(db,orgId,id)→row+phone+contactName|null`, `updateOrderStatus(db,orgId,id,OrderStatus)`, `setOrderDispatched(db,orgId,id,bool)`, acciones `updateOrderStatusAction`/`setOrderDispatchedAction`.
