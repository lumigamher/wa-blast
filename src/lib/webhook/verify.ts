import { and, eq, isNull } from "drizzle-orm";
import { organizationSettings } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

/**
 * Verifica un webhook token Meta y estampa webhookVerifiedAt (pasivamente).
 *
 * - Busca settings por metaVerifyToken
 * - Si no existe o token es inválido → lanza error
 * - Si existe y webhookVerifiedAt es null → lo estampa
 * - Si ya está estampado → NO lo actualiza (idempotente)
 *
 * @param db Database client
 * @param token Meta verify token
 * @returns Settings con la org verificada
 * @throws Si el token no es válido
 */
export async function verifyWebhookToken(
  db: DB,
  token: string
) {
  const settings = await db.query.organizationSettings.findFirst({
    where: (t, { eq }) => eq(t.metaVerifyToken, token),
  });

  if (!settings) {
    throw new Error("Invalid webhook token");
  }

  // Stamp solo si es la primera vez (webhookVerifiedAt es null)
  if (!settings.webhookVerifiedAt) {
    await db
      .update(organizationSettings)
      .set({ webhookVerifiedAt: new Date() })
      .where(
        and(
          eq(organizationSettings.orgId, settings.orgId),
          isNull(organizationSettings.webhookVerifiedAt)
        )
      );
  }

  return settings;
}
