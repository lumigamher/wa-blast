import { randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { orders, conversations, contacts } from "@/lib/db/schema";
import type { CatalogProvider } from "@/lib/agent/integrations/catalog/types";

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

export type CreateOrderInput = {
  orgId: string;
  conversationId?: string;
  contactId?: string;
  items: Array<{
    productId: string;
    cantidad: number;
    variantId?: string;
  }>;
};

export type ResolvedOrderItem = {
  productId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
  variantId?: string;
  variantLabel?: string;
};

export type CreateOrderResult = {
  orderId: string;
  numero: number;
  totalCop: number;
  items: ResolvedOrderItem[];
};

async function nextOrderNumber(db: DB, orgId: string): Promise<number> {
  const [r] = await db.select({ max: sql<number>`coalesce(max(${orders.numero}), 0)` }).from(orders).where(eq(orders.orgId, orgId));
  return (r?.max ?? 0) + 1;
}

export async function createOrder(
  db: DB,
  input: CreateOrderInput,
  provider: CatalogProvider
): Promise<CreateOrderResult> {
  const resolvedItems: ResolvedOrderItem[] = [];
  let totalCop = 0;

  // Resolver cada producto y validar disponibilidad
  for (const item of input.items) {
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      throw new Error(`Cantidad inválida: ${item.cantidad}`);
    }
    const product = await provider.get(item.productId);
    if (!product) {
      throw new Error(`Producto no encontrado: ${item.productId}`);
    }

    let precioUnitario = product.priceCop;
    let variantId: string | undefined;
    let variantLabel: string | undefined;

    // Si se eligió una variante, validar y usar su precio
    if (item.variantId) {
      const variant = product.variants?.find((v) => v.id === item.variantId);
      if (!variant) {
        throw new Error(`Variante no encontrada: ${item.variantId}`);
      }
      precioUnitario = variant.priceCop ?? product.priceCop;
      variantId = variant.id;
      variantLabel = variant.label;
    }

    const subtotal = precioUnitario * item.cantidad;
    resolvedItems.push({
      productId: product.id,
      nombre: product.name,
      precioUnitario,
      cantidad: item.cantidad,
      subtotal,
      ...(variantId ? { variantId, variantLabel } : {}),
    });
    totalCop += subtotal;
  }

  // Anti-duplicados: reusar el pedido pendiente de la conversación
  if (input.conversationId) {
    const latest = await getLatestOrderForConversation(db, input.orgId, input.conversationId);
    if (latest && latest.status === "pendiente") {
      await db.update(orders).set({ itemsJson: JSON.stringify(resolvedItems), totalCop }).where(eq(orders.id, latest.id));
      return { orderId: latest.id, numero: latest.numero ?? 0, totalCop, items: resolvedItems };
    }
  }

  // Crear nuevo pedido
  const orderId = randomUUID();
  const numero = await nextOrderNumber(db, input.orgId);
  const now = new Date();

  await db.insert(orders).values({
    id: orderId,
    orgId: input.orgId,
    conversationId: input.conversationId ?? null,
    contactId: input.contactId ?? null,
    itemsJson: JSON.stringify(resolvedItems),
    totalCop,
    numero,
    createdAt: now,
  });

  return {
    orderId,
    numero,
    totalCop,
    items: resolvedItems,
  };
}

export async function getLatestOrderForConversation(
  db: DB,
  orgId: string,
  conversationId: string
) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.conversationId, conversationId)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row ?? null;
}

export async function setOrderShipping(
  db: DB,
  orgId: string,
  orderId: string,
  input: { addressJson?: string; quoteJson?: string }
): Promise<void> {
  await db
    .update(orders)
    .set({
      ...(input.addressJson !== undefined ? { shippingAddressJson: input.addressJson } : {}),
      ...(input.quoteJson !== undefined ? { shippingQuoteJson: input.quoteJson } : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.orgId, orgId)));
}

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
