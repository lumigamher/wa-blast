import type { DB } from "@/lib/db/client";
import { recordOutboundMessage } from "@/lib/inbox/store";
import { saveMediaAsset } from "@/lib/media/store";

/**
 * Registra en el inbox la media que una herramienta acaba de enviar por Meta.
 *
 * Sin esto, la foto/archivo/QR llega al cliente por WhatsApp pero el equipo no
 * la ve en la conversación: queda un hueco donde parece que el agente no envió
 * nada. Guardamos los bytes como asset local porque la ruta del inbox sirve los
 * ids `media_*` directo desde disco, sin depender de que el id de Meta siga vivo.
 *
 * Nunca lanza: el cliente YA recibió el mensaje, así que un fallo al registrarlo
 * no puede convertirse en un fallo de la herramienta (haría que el agente
 * reintentara y el cliente recibiera la foto dos veces).
 */
export async function recordOutboundMedia(
  db: DB,
  input: {
    orgId: string;
    conversationId: string;
    wamid: string | null;
    bytes: ArrayBuffer;
    mime: string;
    kind: "image" | "video" | "audio" | "document" | "sticker";
    caption?: string | null;
  },
): Promise<void> {
  try {
    const asset = await saveMediaAsset(db, {
      orgId: input.orgId,
      bytes: input.bytes,
      mime: input.mime,
      kind: input.kind,
    });
    await recordOutboundMessage(db, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      wamid: input.wamid,
      type: input.kind,
      body: input.caption ?? null,
      status: input.wamid ? "sent" : "failed",
      mediaId: asset.id,
    });
  } catch {
    // Ver docstring: registrar es best-effort, enviar ya ocurrió.
  }
}

/** Igual que arriba pero para mensajes salientes sin media (texto, flows). */
export async function recordOutboundText(
  db: DB,
  input: {
    orgId: string;
    conversationId: string;
    wamid: string | null;
    body: string;
    type?: string;
  },
): Promise<void> {
  try {
    await recordOutboundMessage(db, {
      orgId: input.orgId,
      conversationId: input.conversationId,
      wamid: input.wamid,
      type: input.type ?? "text",
      body: input.body,
      status: input.wamid ? "sent" : "failed",
    });
  } catch {
    // best-effort, igual que recordOutboundMedia
  }
}
