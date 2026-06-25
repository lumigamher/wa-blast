import { readFile } from "node:fs/promises";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { getCatalogConfig } from "../../integrations/catalog/config";
import { getCatalogProvider } from "../../integrations/catalog/index";
import { uploadMedia, sendMedia } from "@/lib/meta/client";
import { getOrgSettings } from "@/lib/org/settings";
import { getMediaAsset } from "@/lib/media/store";
import { conversations } from "@/lib/db/schema";
import { toJpeg, isWhatsAppImageMime } from "@/lib/media/transcode";
import type { AgentTool } from "../types";

const schema = z.object({
  productId: z.string().optional(),
  query: z.string().optional(),
  variantLabel: z.string().optional(),
});

/** Construye la caption de la imagen con nombre, variante, precio y descripción. */
export function buildCaption(
  p: { name: string; priceCop: number; description?: string | null },
  variantLabel?: string,
): string {
  const price = `$${p.priceCop.toLocaleString("es-CO")}`;
  const head = `${p.name}${variantLabel ? ` — ${variantLabel}` : ""} · ${price}`;
  const desc = (p.description ?? "").trim();
  const full = desc ? `${head}\n\n${desc}` : head;
  // WhatsApp caption limit is 1024 characters
  return full.length > 1024 ? full.slice(0, 1021) + "…" : full;
}

async function fetchImageBytes(
  db: DB,
  orgId: string,
  url: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  // Check if it's a local media asset URL
  const mediaMatch = url.match(/^\/api\/inbox\/media\/(media_[^/?]+)/);
  if (mediaMatch) {
    const mediaAssetId = mediaMatch[1];
    const asset = await getMediaAsset(db, mediaAssetId);
    if (!asset || asset.orgId !== orgId) {
      return null;
    }
    try {
      const buf = await readFile(asset.path);
      const bytes = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
      return { bytes, mime: asset.mime };
    } catch {
      return null;
    }
  }

  // Fetch from external URL
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return { bytes, mime };
  } catch {
    return null;
  }
}

export const enviarFotoProducto: AgentTool = {
  name: "enviar_foto_producto",
  description:
    "Envía al cliente la foto de un producto (o de una variante específica) por WhatsApp. Úsalo cuando el cliente quiere ver el producto.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "ID del producto (opcional si hay query)" },
      query: { type: "string", description: "Nombre del producto a buscar (opcional si hay productId)" },
      variantLabel: { type: "string", description: "Etiqueta de variante específica (ej: 'Talla L')" },
    },
  },
  escalates: false,
  async run(args, ctx) {
    const { productId, query, variantLabel } = schema.parse(args);

    // 1. Load catalog config
    const cfg = await getCatalogConfig(ctx.db, ctx.orgId);
    if (!cfg) {
      return { ok: false, error: "Catálogo no configurado" };
    }

    const provider = getCatalogProvider({
      provider: cfg.provider,
      db: ctx.db,
      orgId: ctx.orgId,
      credentials: cfg.credentials,
      config: cfg.config,
    });

    // 2. Resolve product
    let product;
    if (productId) {
      product = await provider.get(productId);
    } else if (query) {
      const results = await provider.search({ query, limit: 1 });
      product = results[0] ?? null;
    } else {
      return { ok: false, error: "Indica el producto" };
    }

    if (!product) {
      return { ok: false, error: "Producto no encontrado" };
    }

    // 3. Pick image
    if (!product.images || product.images.length === 0) {
      return { ok: false, error: "El producto no tiene fotos" };
    }

    let selectedImage = product.images[0];

    // If variant label is specified, try to find matching image
    if (variantLabel && product.variants) {
      const variant = product.variants.find(
        (v) => v.label.toLowerCase().includes(variantLabel.toLowerCase()),
      );
      if (variant) {
        const variantImage = product.images.find((img) => img.variantId === variant.id);
        if (variantImage) {
          selectedImage = variantImage;
        }
      }
    }

    // 4. Fetch image bytes
    const imageBytesResult = await fetchImageBytes(ctx.db, ctx.orgId, selectedImage.url);
    if (!imageBytesResult) {
      return { ok: false, error: "No pude obtener la imagen" };
    }
    let { bytes, mime } = imageBytesResult;

    // 4a. Convert to JPEG if not JPEG/PNG (WhatsApp doesn't deliver WebP as image)
    if (!isWhatsAppImageMime(mime)) {
      try {
        bytes = (await toJpeg(bytes)).buffer as ArrayBuffer;
        mime = "image/jpeg";
      } catch {
        return { ok: false, error: "No pude preparar la imagen" };
      }
    }

    // 5. Load settings and get conversation phone
    const settings = await getOrgSettings(ctx.db, ctx.orgId);

    const [convRow] = await ctx.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, ctx.conversationId));
    if (!convRow) {
      return { ok: false, error: "Conversación sin teléfono" };
    }
    const phone = convRow.phone;

    // 6. Upload media to Meta
    const uploadResult = await uploadMedia(settings, { bytes, mime });
    if ("error" in uploadResult) {
      return { ok: false, error: uploadResult.error.message };
    }

    // 7. Send media with caption including product info
    const caption = buildCaption(product, variantLabel);
    const sendResult = await sendMedia(settings, {
      to: phone,
      kind: "image",
      mediaId: uploadResult.mediaId,
      caption,
    });
    if ("error" in sendResult) {
      return { ok: false, error: sendResult.error.message };
    }

    return { ok: true, data: { enviado: true } };
  },
};
