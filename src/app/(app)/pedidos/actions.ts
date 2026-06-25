"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listOrders, countOrders, updateOrderStatus, setOrderDispatched, type OrderStatus } from "@/lib/agent/catalog/orders";

export async function getOrdersData(filters: { status?: OrderStatus; page?: number }) {
  const { orgId } = await requireOrg();
  const page = Math.max(1, filters.page ?? 1);
  const PAGE_SIZE = 30;
  const orders = await listOrders(db, orgId, { status: filters.status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const total = await countOrders(db, orgId, { status: filters.status });
  return { orders, total, page, pageSize: PAGE_SIZE };
}

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
