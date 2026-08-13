import { randomUUID } from "node:crypto";
import { gte, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { webhookDrops } from "@/lib/db/schema";

/** Tope del payload guardado: suficiente para diagnosticar, sin inflar la base. */
const MAX_BODY = 10_000;

/**
 * Deja rastro de un webhook que no pasó validación.
 *
 * Nunca lanza: se llama desde la ruta del webhook, que DEBE responder 200 pase
 * lo que pase. Un fallo al registrar no puede convertirse en un fallo de la
 * ruta, porque entonces Meta reintentaría en bucle.
 */
export async function recordWebhookDrop(
  db: DB,
  input: { reason: string; rawBody: string },
): Promise<void> {
  try {
    await db.insert(webhookDrops).values({
      id: randomUUID(),
      reason: input.reason.slice(0, 500),
      rawBody: input.rawBody.slice(0, MAX_BODY),
      createdAt: new Date(),
    });
  } catch {
    // Ver docstring.
  }
}

/** Descartes en las últimas `hours` horas — lo que se muestra en /salud. */
export async function countRecentDrops(db: DB, hours: number): Promise<number> {
  const desde = new Date(Date.now() - hours * 3600 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(webhookDrops)
    .where(gte(webhookDrops.createdAt, desde));
  return Number(row?.n ?? 0);
}

/** Retención corta: los payloads crudos llevan teléfonos y nombres. */
export async function pruneOldDrops(db: DB, days: number): Promise<void> {
  const corte = new Date(Date.now() - days * 24 * 3600 * 1000);
  await db.delete(webhookDrops).where(lt(webhookDrops.createdAt, corte));
}
