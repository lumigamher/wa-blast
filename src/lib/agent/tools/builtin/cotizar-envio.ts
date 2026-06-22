import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { products, productVariants } from "@/lib/db/schema";
import { getShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { getShippingProvider } from "@/lib/agent/integrations/shipping/index";
import type { CarrierQuote } from "@/lib/agent/integrations/shipping/types";
import { computePackage, type ComputedPackage, type PackageItem } from "@/lib/agent/shipping/package";
import { getLatestOrderForConversation } from "@/lib/agent/catalog/orders";
import type { AgentTool } from "../types";

const schema = z.object({
  ciudadDestino: z.string().min(1),
  valorDeclaradoCop: z.number().optional(),
});

export const cotizarEnvio: AgentTool = {
  name: "cotizar_envio",
  description:
    "Cotiza el envío del pedido actual a una ciudad de destino y devuelve las opciones (más barata y más rápida). Pide la ciudad de destino antes de usarla.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      ciudadDestino: { type: "string", description: "Ciudad de destino del envío" },
      valorDeclaradoCop: {
        type: "number",
        description: "Valor declarado (opcional; por defecto el total del pedido)",
      },
    },
    required: ["ciudadDestino"],
  },
  escalates: false,
  async run(args, ctx) {
    const { ciudadDestino, valorDeclaradoCop } = schema.parse(args);

    const cfg = await getShippingConfig(ctx.db, ctx.orgId);
    if (!cfg) return { ok: false, error: "Envíos no configurado" };

    const order = await getLatestOrderForConversation(ctx.db, ctx.orgId, ctx.conversationId);
    if (!order) return { ok: false, error: "No hay un pedido para cotizar" };

    let parsed: Array<{ productId: string; cantidad: number; variantId?: string }>;
    try {
      parsed = JSON.parse(order.itemsJson);
    } catch {
      return { ok: false, error: "Pedido inválido" };
    }
    if (parsed.length === 0) return { ok: false, error: "El pedido no tiene productos" };

    const ids = parsed.map((i) => i.productId);
    const rows = await ctx.db
      .select()
      .from(products)
      .where(and(eq(products.orgId, ctx.orgId), inArray(products.id, ids)));
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Batch-load all variants referenced in the order
    const variantIds = parsed
      .filter((i) => i.variantId)
      .map((i) => i.variantId as string);
    const variantRows =
      variantIds.length > 0
        ? await ctx.db
            .select()
            .from(productVariants)
            .where(
              and(
                eq(productVariants.orgId, ctx.orgId),
                inArray(productVariants.id, variantIds)
              )
            )
        : [];
    const variantsById = new Map(variantRows.map((v) => [v.id, v]));

    const pkgItems: PackageItem[] = [];
    for (const it of parsed) {
      const p = byId.get(it.productId);
      if (!p) return { ok: false, error: "Producto del pedido no encontrado" };

      // Determine weight/dims: variant if present, fallback to product
      let weight = p.weightGrams;
      let length = p.lengthCm;
      let width = p.widthCm;
      let height = p.heightCm;

      if (it.variantId) {
        const v = variantsById.get(it.variantId);
        if (v) {
          // Use variant values if non-null, otherwise fallback to product
          weight = v.weightGrams ?? p.weightGrams;
          length = v.lengthCm ?? p.lengthCm;
          width = v.widthCm ?? p.widthCm;
          height = v.heightCm ?? p.heightCm;
        }
      }

      if (weight == null || length == null || width == null || height == null) {
        return {
          ok: false,
          error: `Falta el peso o las dimensiones de "${p.name}"${it.variantId ? ` (variante)` : ""}. Cárgalos en el catálogo.`,
        };
      }
      pkgItems.push({
        weightGrams: weight,
        lengthCm: length,
        widthCm: width,
        heightCm: height,
        quantity: it.cantidad,
      });
    }

    const factor = Number(cfg.config.volumetricFactor) || 2500;
    let pkg: ComputedPackage;
    try {
      pkg = computePackage(pkgItems, { volumetricFactor: factor });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "No pude calcular el paquete",
      };
    }

    const provider = getShippingProvider({
      provider: cfg.provider,
      credentials: cfg.credentials,
      config: cfg.config,
    });
    let quotes: CarrierQuote[];
    try {
      quotes = await provider.quote({
        originCityName: String(cfg.config.originCityName ?? ""),
        originCityCode: cfg.config.originCityCode
          ? String(cfg.config.originCityCode)
          : undefined,
        destinationCityName: ciudadDestino,
        pkg: {
          pesoFacturableKg: pkg.pesoFacturableKg,
          lengthCm: pkg.dims.lengthCm,
          widthCm: pkg.dims.widthCm,
          heightCm: pkg.dims.heightCm,
        },
        declaredValueCop: valorDeclaradoCop ?? order.totalCop,
      });
    } catch {
      return { ok: false, error: "No pude obtener cotizaciones en este momento" };
    }
    if (quotes.length === 0)
      return { ok: false, error: "Sin opciones de envío para ese destino" };

    const barata = [...quotes].sort((a, b) => a.priceCop - b.priceCop)[0];
    const rapida = [...quotes]
      .filter((q) => q.deliveryDays != null)
      .sort((a, b) => (a.deliveryDays as number) - (b.deliveryDays as number))[0] ?? barata;

    const opciones = [
      barata,
      ...(rapida.carrier !== barata.carrier || rapida.service !== barata.service ? [rapida] : []),
    ];
    return {
      ok: true,
      data: {
        pesoFacturableKg: Math.round(pkg.pesoFacturableKg * 100) / 100,
        opciones,
      },
    };
  },
};
