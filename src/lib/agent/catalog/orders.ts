import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import type { CatalogProvider } from "@/lib/agent/integrations/catalog/types";

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
