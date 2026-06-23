import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentTools, products } from "@/lib/db/schema";
import { saveAgentConfig } from "./config";
import { getCalendarConfig, saveCalendarConfig } from "./integrations/calendar/config";
import { getCatalogConfig, saveCatalogConfig } from "./integrations/catalog/config";
import { saveShippingConfig, type ShippingConfig } from "./integrations/shipping/config";
import { BUILTIN_TOOLS } from "./tools/registry";

type ConfigInput = {
  enabled?: boolean;
  name?: string;
  systemPrompt?: string;
  provider?: "openai" | "anthropic";
  model?: string;
  temperature?: number;
  fallbackMessage?: string;
  monthlyCostCapCop?: number | null;
  advancedMode?: boolean;
  templateId?: string | null;
  checkoutFlowId?: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export async function updateAgentConfig(db: DB, orgId: string, input: ConfigInput): Promise<void> {
  const patch: ConfigInput = { ...input };
  if (input.provider && input.provider !== "openai" && input.provider !== "anthropic") {
    delete patch.provider;
  }
  if (typeof input.temperature === "number") patch.temperature = clamp(input.temperature, 0, 1);
  if (typeof input.name === "string") patch.name = input.name.slice(0, 80);
  await saveAgentConfig(db, orgId, patch);
}

export async function setAgentTool(db: DB, orgId: string, key: string, enabled: boolean): Promise<void> {
  if (!(key in BUILTIN_TOOLS)) throw new Error(`Tool desconocida: ${key}`);
  const existing = (
    await db.select().from(agentTools).where(and(eq(agentTools.orgId, orgId), eq(agentTools.key, key), eq(agentTools.type, "builtin")))
  )[0];
  if (existing) {
    await db.update(agentTools).set({ enabled }).where(eq(agentTools.id, existing.id));
  } else {
    await db.insert(agentTools).values({ id: randomUUID(), orgId, type: "builtin", key, enabled, configJson: "{}", createdAt: new Date() });
  }
}

export type CalendarInput = {
  provider: "calcom" | "calendly" | "google";
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
  timezone: string;
};

export async function saveCalendar(db: DB, orgId: string, input: CalendarInput): Promise<void> {
  if (input.provider !== "calcom") throw new Error("Provider de calendario no soportado aún");
  if (!Number.isFinite(input.eventTypeId) || input.eventTypeId <= 0) throw new Error("eventTypeId inválido");
  // Si dejan la API key vacía, reusa la ya guardada (permite editar otros campos
  // sin re-pegar la credencial). Si no hay ninguna, es obligatoria.
  let apiKey = input.apiKey.trim();
  if (!apiKey) {
    const existing = await getCalendarConfig(db, orgId);
    apiKey = existing?.apiKey ?? "";
  }
  if (!apiKey) throw new Error("API key requerida");
  await saveCalendarConfig(db, orgId, {
    provider: input.provider,
    apiKey,
    eventTypeId: input.eventTypeId,
    durationMin: input.durationMin > 0 ? input.durationMin : 30,
    timezone: input.timezone || "America/Bogota",
  });
}

export type CatalogInput = {
  provider: "internal" | "http" | "shopify" | "medusa";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export async function saveCatalog(db: DB, orgId: string, input: CatalogInput): Promise<void> {
  if (!["internal", "http", "shopify", "medusa"].includes(input.provider)) throw new Error("Provider inválido");
  // Si dejan credenciales vacías, conserva las guardadas (no re-pegar secretos).
  let credentials = input.credentials;
  if (Object.keys(credentials).length === 0) {
    const existing = await getCatalogConfig(db, orgId);
    if (existing) credentials = existing.credentials;
  }
  await saveCatalogConfig(db, orgId, { provider: input.provider, credentials, config: input.config });
}

export type ListProductsOpts = { search?: string; limit?: number; offset?: number };

function productSearchCond(orgId: string, search?: string) {
  const conds = [eq(products.orgId, orgId)];
  const q = search?.trim().toLowerCase();
  if (q) {
    const like$ = `%${q}%`;
    conds.push(or(like(sql`lower(${products.name})`, like$), like(sql`lower(coalesce(${products.sku}, ''))`, like$))!);
  }
  return and(...conds);
}

export async function listProducts(db: DB, orgId: string, opts: ListProductsOpts = {}) {
  const base = db.select().from(products).where(productSearchCond(orgId, opts.search)).orderBy(asc(products.name));
  if (opts.limit != null) return base.limit(opts.limit).offset(opts.offset ?? 0);
  return base;
}

export async function countProducts(db: DB, orgId: string, opts: { search?: string } = {}): Promise<number> {
  const [row] = await db.select({ n: count() }).from(products).where(productSearchCond(orgId, opts.search));
  return row?.n ?? 0;
}

export async function addProduct(
  db: DB,
  orgId: string,
  input: { name: string; priceCop: number; description?: string; sku?: string },
): Promise<void> {
  if (!input.name.trim()) throw new Error("Nombre requerido");
  if (!Number.isFinite(input.priceCop) || input.priceCop < 0) throw new Error("Precio inválido");
  await db.insert(products).values({
    id: randomUUID(),
    orgId,
    name: input.name.trim(),
    priceCop: Math.round(input.priceCop),
    description: input.description ?? null,
    sku: input.sku ?? null,
    available: true,
    createdAt: new Date(),
  });
}

export async function deleteProduct(db: DB, orgId: string, productId: string): Promise<void> {
  await db.delete(products).where(and(eq(products.id, productId), eq(products.orgId, orgId)));
}

export async function setProductAvailable(db: DB, orgId: string, id: string, available: boolean): Promise<void> {
  await db.update(products).set({ available }).where(and(eq(products.id, id), eq(products.orgId, orgId)));
}

export async function setProductsAvailable(db: DB, orgId: string, ids: string[], available: boolean): Promise<void> {
  if (ids.length === 0) return;
  await db.update(products).set({ available }).where(and(eq(products.orgId, orgId), inArray(products.id, ids)));
}

export async function upsertProductBySku(
  db: DB,
  orgId: string,
  input: { name: string; priceCop: number; sku?: string | null; description?: string | null; available?: boolean },
): Promise<{ id: string; action: "created" | "updated" }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nombre requerido");
  if (!Number.isFinite(input.priceCop) || input.priceCop < 0) throw new Error("Precio inválido");
  const sku = (input.sku ?? "").trim() || null;
  const priceCop = Math.round(input.priceCop);
  if (sku) {
    const [existing] = await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.sku, sku)));
    if (existing) {
      await db
        .update(products)
        .set({
          name,
          priceCop,
          description: input.description ?? existing.description,
          available: input.available ?? existing.available,
        })
        .where(eq(products.id, existing.id));
      return { id: existing.id, action: "updated" };
    }
  }
  const id = randomUUID();
  await db.insert(products).values({
    id,
    orgId,
    name,
    priceCop,
    description: input.description ?? null,
    sku,
    available: input.available ?? true,
    createdAt: new Date(),
  });
  return { id, action: "created" };
}

export async function saveShipping(db: DB, orgId: string, input: ShippingConfig): Promise<void> {
  await saveShippingConfig(db, orgId, input);
}

export async function updateProductDims(
  db: DB,
  orgId: string,
  id: string,
  dims: { weightGrams?: number | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null },
): Promise<void> {
  await db.update(products).set(dims).where(and(eq(products.id, id), eq(products.orgId, orgId)));
}
