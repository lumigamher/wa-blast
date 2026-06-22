"use server";
import { revalidatePath } from "next/cache";
import { setAgentTool, updateAgentConfig, saveCalendar, saveCatalog, addProduct, deleteProduct, setProductAvailable, setProductsAvailable } from "@/lib/agent/admin";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { CatalogInput } from "@/lib/agent/admin";
import { addPaymentMethod, setPaymentMethodEnabled, deletePaymentMethod, setPaymentMethodQr } from "@/lib/agent/payments/methods";
import type { PaymentType } from "@/lib/agent/payments/methods";
import { addVariant, deleteVariant, setVariantAvailable } from "@/lib/agent/catalog/variants";
import { addImageUrl, deleteImage } from "@/lib/agent/catalog/images";
import { ingestDocument } from "@/lib/agent/rag/ingest";
import { deleteDocument } from "@/lib/agent/rag/admin";
import { getEmbeddingProvider } from "@/lib/agent/rag/embeddings";
import { bulkImportProducts, type ValidProductRow } from "@/lib/agent/catalog/import";

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

export async function addPaymentMethodAction(input: {
  type: string;
  label: string;
  details: string;
}): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    const validTypes: PaymentType[] = ["nequi", "daviplata", "bre_b", "transferencia", "link"];
    if (!validTypes.includes(input.type as PaymentType)) {
      return { error: "Tipo de medio de pago inválido" };
    }
    await addPaymentMethod(db, orgId, {
      type: input.type as PaymentType,
      label: input.label,
      details: input.details,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function togglePaymentMethodAction(
  id: string,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setPaymentMethodEnabled(db, orgId, id, enabled);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function deletePaymentMethodAction(id: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await deletePaymentMethod(db, orgId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function addVariantAction(
  productId: string,
  input: { label: string; priceCop?: number | null; sku?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await addVariant(db, orgId, productId, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function deleteVariantAction(variantId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await deleteVariant(db, orgId, variantId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function setVariantAvailableAction(
  variantId: string,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setVariantAvailable(db, orgId, variantId, enabled);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function addImageUrlAction(
  productId: string,
  input: { url: string; label?: string | null; variantId?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await addImageUrl(db, orgId, productId, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function deleteImageAction(imageId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await deleteImage(db, orgId, imageId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function addTextDocumentAction(input: {
  name: string;
  text: string;
}): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await ingestDocument(
      db,
      orgId,
      { name: input.name || "Documento", text: input.text, source: "text" },
      { embeddings: getEmbeddingProvider() },
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await deleteDocument(db, orgId, documentId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function removePaymentQrAction(id: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setPaymentMethodQr(db, orgId, id, null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente/pagos");
  return { ok: true };
}

export async function setProductAvailableAction(
  id: string,
  available: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setProductAvailable(db, orgId, id, available);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente/catalogo");
  return { ok: true };
}

export async function setProductsAvailableAction(
  ids: string[],
  available: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setProductsAvailable(db, orgId, ids, available);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente/catalogo");
  return { ok: true };
}

export async function importProductsAction(
  rows: ValidProductRow[],
): Promise<{ ok: true; summary: Awaited<ReturnType<typeof bulkImportProducts>> } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    const summary = await bulkImportProducts(db, orgId, rows);
    revalidatePath("/configuracion/agente/catalogo");
    return { ok: true, summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
