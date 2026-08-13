import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contacts, conversations } from "@/lib/db/schema";

/**
 * Identidad de un usuario de WhatsApp tal como llega del webhook.
 *
 * Meta SIEMPRE manda el BSUID (`contacts[].user_id` / `messages[].from_user_id`).
 * El teléfono (`wa_id` / `from`) solo aparece si hubo interacción en los últimos
 * 30 días, si el usuario está en la libreta del negocio, o si no adoptó username.
 * Por eso el teléfono no puede ser la llave del sistema.
 */
export type Identity = {
  phone?: string | null;
  bsuid?: string | null;
  username?: string | null;
};

type ContactRow = typeof contacts.$inferSelect;
type ConversationRow = typeof conversations.$inferSelect;

/** Solo escribe valores que llegaron y faltaban. Nunca pisa un dato con null. */
function camposACompletar(
  actual: { phone: string | null; username?: string | null; bsuid?: string | null },
  id: Identity,
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (!actual.phone && id.phone) patch.phone = id.phone;
  if (!actual.bsuid && id.bsuid) patch.bsuid = id.bsuid;
  if (id.username && actual.username !== id.username) patch.username = id.username;
  return patch;
}

async function resolverContacto(
  db: DB,
  orgId: string,
  id: Identity,
  ts: Date,
  profileName?: string | null,
): Promise<ContactRow> {
  const buscarPor = async (col: typeof contacts.bsuid | typeof contacts.phone, val: string) =>
    (await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(col, val))))[0];

  // 1) Por BSUID, que es la identidad que siempre viene.
  let row = id.bsuid ? await buscarPor(contacts.bsuid, id.bsuid) : undefined;

  // 2) Si no, por teléfono: aquí es donde un contacto de siempre recibe su BSUID
  //    en vez de convertirse en un contacto nuevo el día que adopta username.
  if (!row && id.phone) row = await buscarPor(contacts.phone, id.phone);

  if (row) {
    const patch = camposACompletar(row, id);
    if (!row.name && profileName?.trim()) patch.name = profileName.trim();
    if (Object.keys(patch).length > 0) {
      await db.update(contacts).set({ ...patch, updatedAt: ts }).where(eq(contacts.id, row.id));
      row = { ...row, ...patch } as ContactRow;
    }
    return row;
  }

  // 3) Nuevo.
  const nuevo = {
    id: randomUUID(),
    orgId,
    phone: id.phone ?? null,
    bsuid: id.bsuid ?? null,
    username: id.username ?? null,
    name: profileName?.trim() || null,
    email: null,
    customFields: "{}",
    optOutAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.insert(contacts).values(nuevo).onConflictDoNothing();
  const col = id.bsuid ? contacts.bsuid : contacts.phone;
  const val = (id.bsuid ?? id.phone) as string;
  return (await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(col, val))))[0];
}

/**
 * Punto único del sistema que decide a qué contacto y conversación pertenece un
 * mensaje entrante. Toda la lógica de identidad vive aquí; el resto de la app
 * solo consume el resultado.
 */
export async function getOrCreateConversationByIdentity(
  db: DB,
  orgId: string,
  id: Identity,
  ts: Date,
  profileName?: string | null,
): Promise<ConversationRow> {
  if (!id.bsuid && !id.phone) {
    throw new Error("El mensaje no trae identidad: ni teléfono ni BSUID.");
  }

  const contacto = await resolverContacto(db, orgId, id, ts, profileName);

  const buscarConv = async (col: typeof conversations.bsuid | typeof conversations.phone, val: string) =>
    (await db.select().from(conversations).where(and(eq(conversations.orgId, orgId), eq(col, val))))[0];

  let conv = id.bsuid ? await buscarConv(conversations.bsuid, id.bsuid) : undefined;
  if (!conv && id.phone) conv = await buscarConv(conversations.phone, id.phone);

  if (conv) {
    const patch: Record<string, string> = camposACompletar(conv, id);
    if (!conv.contactId && contacto) patch.contactId = contacto.id;
    if (Object.keys(patch).length > 0) {
      await db.update(conversations).set(patch).where(eq(conversations.id, conv.id));
      conv = { ...conv, ...patch } as ConversationRow;
    }
    return conv;
  }

  const row = {
    id: randomUUID(),
    orgId,
    phone: id.phone ?? null,
    bsuid: id.bsuid ?? null,
    username: id.username ?? null,
    contactId: contacto?.id ?? null,
    lastMessageAt: ts,
    lastIncomingAt: null as Date | null,
    unreadCount: 0,
    createdAt: ts,
  };
  await db.insert(conversations).values(row).onConflictDoNothing();
  const col = id.bsuid ? conversations.bsuid : conversations.phone;
  const val = (id.bsuid ?? id.phone) as string;
  return (await db.select().from(conversations).where(and(eq(conversations.orgId, orgId), eq(col, val))))[0];
}
