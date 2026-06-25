import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contacts, conversations, orders } from "@/lib/db/schema";

const KNOWN: Record<string, "name" | "city" | "email" | "company" | "birthday" | "notes"> = {
  nombre: "name",
  name: "name",
  ciudad: "city",
  city: "city",
  email: "email",
  correo: "email",
  empresa: "company",
  company: "company",
  cumpleanos: "birthday",
  cumpleaños: "birthday",
  birthday: "birthday",
  notas: "notes",
  notes: "notes",
};

export async function saveContactFacts(
  db: DB,
  orgId: string,
  contactId: string,
  campos: Record<string, string | number>,
): Promise<void> {
  const [c] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
  if (!c) return;

  const set: Record<string, unknown> = {};
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(c.dataJson ?? "{}");
  } catch {
    data = {};
  }

  for (const [k, raw] of Object.entries(campos)) {
    const v = String(raw).trim();
    if (!v) continue;
    const key = k.trim().toLowerCase();
    const col = KNOWN[key];
    if (col) set[col] = v;
    else data[key] = v;
  }

  set.dataJson = JSON.stringify(data);
  await db
    .update(contacts)
    .set(set)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
}

export async function buildCustomerProfile(
  db: DB,
  orgId: string,
  conversationId: string,
): Promise<string> {
  const [conv] = await db
    .select({ contactId: conversations.contactId })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
  if (!conv?.contactId) return "";

  const [c] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, conv.contactId), eq(contacts.orgId, orgId)));
  if (!c) return "";

  const lines: string[] = [];
  const datos = [
    c.name && `nombre: ${c.name}`,
    c.city && `ciudad: ${c.city}`,
    c.email && `email: ${c.email}`,
    c.company && `empresa: ${c.company}`,
    c.notes && `notas: ${c.notes}`,
  ].filter(Boolean) as string[];

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(c.dataJson ?? "{}");
  } catch {
    data = {};
  }

  for (const [k, v] of Object.entries(data)) datos.push(`${k}: ${v}`);
  if (datos.length) lines.push("Cliente: " + datos.join(" · "));

  const ords = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.contactId, conv.contactId)))
    .orderBy(desc(orders.createdAt))
    .limit(5);

  const addrs: string[] = [];
  for (const o of ords) {
    if (!o.shippingAddressJson) continue;
    try {
      const a = JSON.parse(o.shippingAddressJson) as Record<string, string>;
      const t = [a.direccion, a.ciudad].filter(Boolean).join(", ");
      if (t && !addrs.includes(t)) addrs.push(t);
    } catch {}
  }
  if (addrs.length) lines.push("Direcciones conocidas: " + addrs.slice(0, 3).join(" | "));

  const pays = ords.map((o) => o.paymentMethod).filter(Boolean) as string[];
  if (pays.length) lines.push("Medio de pago habitual: " + pays[0]);

  if (ords.length) {
    lines.push(
      "Pedidos recientes: " +
        ords
          .map((o) => `#${o.id.slice(-6).toUpperCase()} ($${o.totalCop.toLocaleString("es-CO")}, ${o.status})`)
          .join(", "),
    );
  }

  const block = lines.join("\n");
  return block.length > 1500 ? block.slice(0, 1497) + "…" : block;
}
