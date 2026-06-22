import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
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
  }>;
};

export type ResolvedOrderItem = {
  productId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
};

export type CreateOrderResult = {
  orderId: string;
  totalCop: number;
  items: ResolvedOrderItem[];
};

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

    const subtotal = product.priceCop * item.cantidad;
    resolvedItems.push({
      productId: product.id,
      nombre: product.name,
      precioUnitario: product.priceCop,
      cantidad: item.cantidad,
      subtotal,
    });
    totalCop += subtotal;
  }

  // Crear el pedido
  const orderId = randomUUID();
  const now = new Date();

  await db.insert(orders).values({
    id: orderId,
    orgId: input.orgId,
    conversationId: input.conversationId ?? null,
    contactId: input.contactId ?? null,
    itemsJson: JSON.stringify(resolvedItems),
    totalCop,
    createdAt: now,
  });

  return {
    orderId,
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
