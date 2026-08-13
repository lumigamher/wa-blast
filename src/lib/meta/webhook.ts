import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const theirs = Buffer.from(header.slice("sha256=".length), "hex");
  const ours = createHmac("sha256", appSecret).update(rawBody).digest();
  if (theirs.length !== ours.length) return false;
  try {
    return timingSafeEqual(theirs, ours);
  } catch {
    return false;
  }
}

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.string().optional(),
            metadata: z
              .object({
                phone_number_id: z.string(),
              })
              .optional(),
            contacts: z
              .array(
                z.object({
                  // Meta omite wa_id si el usuario adoptó username y no hubo
                  // interacción reciente. user_id (BSUID) siempre viene.
                  wa_id: z.string().optional(),
                  user_id: z.string().optional(),
                  username: z.string().optional(),
                  profile: z.object({ name: z.string() }).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  from: z.string().optional(),
                  from_user_id: z.string().optional(),
                  id: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  context: z.object({ id: z.string() }).optional(),
                }).passthrough(),
              )
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.enum(["sent", "delivered", "read", "failed"]),
                  timestamp: z.string(),
                  recipient_id: z.string().optional(),
                  recipient_user_id: z.string().optional(),
                  errors: z.array(z.object({ message: z.string().optional(), title: z.string().optional() })).optional(),
                }),
              )
              .optional(),
            calls: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string().optional(),
                  to: z.string().optional(),
                  event: z.string(),
                  timestamp: z.string().optional(),
                  direction: z.string().optional(),
                  status: z.string().optional(),
                  duration: z.number().optional(),
                  session: z
                    .object({
                      sdp: z.string().optional(),
                      sdp_type: z.string().optional(),
                    })
                    .optional(),
                }).passthrough(),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/**
 * Extrae la identidad del remitente de un mensaje entrante.
 *
 * Meta manda el teléfono en `messages[].from` / `contacts[].wa_id` solo a veces;
 * el BSUID en `messages[].from_user_id` / `contacts[].user_id` siempre. Devolver
 * ambos permite que la capa de identidad los vincule cuando llegan juntos.
 */
export function identityFromWebhook(
  msg: { from?: string; from_user_id?: string } | undefined,
  contact: { wa_id?: string; user_id?: string; username?: string } | undefined,
): { phone: string | null; bsuid: string | null; username: string | null } {
  const rawPhone = msg?.from ?? contact?.wa_id ?? null;
  return {
    phone: rawPhone ? "+" + rawPhone.replace(/^\+/, "") : null,
    bsuid: msg?.from_user_id ?? contact?.user_id ?? null,
    username: contact?.username ?? null,
  };
}
