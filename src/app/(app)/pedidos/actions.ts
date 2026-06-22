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
