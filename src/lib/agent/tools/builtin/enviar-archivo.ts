import { readFile } from "node:fs/promises";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { uploadMedia, sendMedia } from "@/lib/meta/client";
import { recordOutboundMedia } from "./_record-outbound";
import { getOrgSettings } from "@/lib/org/settings";
import { getMediaAsset } from "@/lib/media/store";
import { conversations } from "@/lib/db/schema";
import { findMedia, listMedia, mimeToKind } from "../../../agent/media-library";
import { toJpeg, isWhatsAppImageMime } from "@/lib/media/transcode";
import type { AgentTool } from "../types";

const schema = z.object({
  query: z.string().optional(),
  mediaId: z.string().optional(),
  productId: z.string().optional(),
});

export const enviarArchivo: AgentTool = {
  name: "enviar_archivo",
  description:
    "Envía al cliente un archivo (imagen, video o documento) de la biblioteca de la empresa por WhatsApp. Úsalo cuando piden el catálogo, una ficha técnica, un video, etc.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Qué archivo enviar (ej: 'catálogo', 'ficha técnica')",
      },
      mediaId: {
        type: "string",
        description: "ID del archivo en la biblioteca (opcional)",
      },
      productId: {
        type: "string",
        description: "Producto asociado (opcional)",
      },
    },
  },
  escalates: false,
  async run(args, ctx) {
    const { query, mediaId, productId } = schema.parse(args);

    // 1. Resolve media item
    let item: Awaited<ReturnType<typeof findMedia>> = null;

    if (mediaId) {
      // Find specific media by ID
      const all = await listMedia(ctx.db, ctx.orgId, productId ? { productId } : undefined);
      item = all.find((m) => m.id === mediaId) ?? null;
    } else if (query) {
      // Search by query
      item = await findMedia(ctx.db, ctx.orgId, query);
    } else {
      return {
        ok: false,
        error: "Indica qué archivo enviar (nombre o ID)",
      };
    }

    if (!item) {
      return {
        ok: false,
        error: "No encontré ese archivo en la biblioteca.",
      };
    }

    // 2. Get media asset and verify org access
    const asset = await getMediaAsset(ctx.db, item.mediaAssetId);
    if (!asset || asset.orgId !== ctx.orgId) {
      return {
        ok: false,
        error: "Archivo no disponible.",
      };
    }

    // 3. Get conversation phone
    const [conv] = await ctx.db
      .select({ phone: conversations.phone })
      .from(conversations)
      .where(and(eq(conversations.id, ctx.conversationId), eq(conversations.orgId, ctx.orgId)));
    if (!conv?.phone) {
      return {
        ok: false,
        error: "Conversación sin teléfono.",
      };
    }

    // 4. Load org settings
    const settings = await getOrgSettings(ctx.db, ctx.orgId);

    // 5. Read file bytes
    let bytes: ArrayBuffer;
    let mime = asset.mime;
    try {
      const buf = await readFile(asset.path);
      bytes = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
    } catch {
      return {
        ok: false,
        error: "No pude leer el archivo.",
      };
    }

    // 5a. Convert image to JPEG if not JPEG/PNG (WhatsApp doesn't deliver WebP as image)
    const kind = mimeToKind(mime);
    if (kind === "image" && !isWhatsAppImageMime(mime)) {
      try {
        bytes = (await toJpeg(bytes)).buffer as ArrayBuffer;
        mime = "image/jpeg";
      } catch {
        return {
          ok: false,
          error: "No pude preparar la imagen.",
        };
      }
    }

    // 6. Upload to Meta
    const uploadResult = await uploadMedia(settings, {
      bytes,
      mime,
      filename: item.label,
    });
    if ("error" in uploadResult) {
      return {
        ok: false,
        error: "No pude subir el archivo a WhatsApp.",
      };
    }

    // 7. Send media
    const sendResult = await sendMedia(settings, {
      to: conv.phone,
      kind,
      mediaId: uploadResult.mediaId,
      filename: kind === "document" ? item.label : undefined,
      replyTo: undefined,
    });
    if ("error" in sendResult) {
      return {
        ok: false,
        error: "No pude enviar el archivo.",
      };
    }

    await recordOutboundMedia(ctx.db, {
      orgId: ctx.orgId,
      conversationId: ctx.conversationId,
      wamid: sendResult.wamid,
      bytes,
      mime,
      kind,
      caption: item.label,
    });

    return { ok: true, data: { sent: item.label } };
  },
};
