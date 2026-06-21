"use server";
import { revalidatePath } from "next/cache";
import { setAgentTool, updateAgentConfig, saveCalendar, saveCatalog, addProduct, deleteProduct } from "@/lib/agent/admin";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { CatalogInput } from "@/lib/agent/admin";

export async function saveAgentConfigAction(
  input: Parameters<typeof updateAgentConfig>[2],
): Promise<{ ok: true }> {
  const { orgId } = await requireOrg();
  await updateAgentConfig(db, orgId, input);
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function setAgentToolAction(
  key: string,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setAgentTool(db, orgId, key, enabled);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function saveCalendarAction(input: {
  provider: "calcom" | "calendly" | "google";
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
  timezone: string;
}): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await saveCalendar(db, orgId, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function saveCatalogAction(input: CatalogInput): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await saveCatalog(db, orgId, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function addProductAction(input: {
  name: string;
  priceCop: number;
  description?: string;
  sku?: string;
}): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await addProduct(db, orgId, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function deleteProductAction(productId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await deleteProduct(db, orgId, productId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}
