"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listOrders, countOrders, updateOrderStatus, setOrderDispatched, type OrderStatus } from "@/lib/agent/catalog/orders";

export type BoardColumnKey = "nuevos" | "confirmados" | "pagados" | "despachados";

export type OrdersBoardData = {
  columns: Record<BoardColumnKey, Awaited<ReturnType<typeof listOrders>>>;
  cancelados: Awaited<ReturnType<typeof listOrders>>;
  todayCount: number;
  todayTotalCop: number;
};

const DISPATCHED_WINDOW_MS = 48 * 3600 * 1000;

export async function getOrdersBoardData(): Promise<OrdersBoardData> {
  const { orgId } = await requireOrg();
  const all = await listOrders(db, orgId, { limit: 200 });

  const columns: OrdersBoardData["columns"] = { nuevos: [], confirmados: [], pagados: [], despachados: [] };
  const cancelados: OrdersBoardData["cancelados"] = [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  let todayCount = 0;
  let todayTotalCop = 0;

  for (const o of all) {
    if (o.createdAt >= startOfToday && o.status !== "cancelado") {
      todayCount++;
      todayTotalCop += o.totalCop;
    }
    if (o.status === "cancelado") cancelados.push(o);
    else if (o.status === "pendiente") columns.nuevos.push(o);
    else if (o.status === "confirmado") columns.confirmados.push(o);
    else if (o.status === "pagado" && !o.dispatchedAt) columns.pagados.push(o);
    else if (o.dispatchedAt && Date.now() - o.dispatchedAt.getTime() < DISPATCHED_WINDOW_MS) {
      columns.despachados.push(o);
    }
  }
  return { columns, cancelados, todayCount, todayTotalCop };
}

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
