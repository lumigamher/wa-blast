import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contacts, flowResponses } from "@/lib/db/schema";

export type FlowResponseRow = typeof flowResponses.$inferSelect;

type ContactField = "name" | "email" | "city" | "company" | "birthday";

// Sinónimos comunes (ES/EN) → campo del contacto. Se normalizan igual que las
// claves entrantes (minúsculas, sin acentos, no-alfanumérico → "_").
const FIELD_SYNONYMS: Record<ContactField, string[]> = {
  name: ["nombre", "nombres", "name", "nombre_completo", "full_name", "fullname"],
  email: ["email", "correo", "correo_electronico", "e_mail", "mail"],
  city: ["ciudad", "city", "municipio"],
  company: [
    "empresa",
    "company",
    "negocio",
    "compania",
    "organizacion",
    "organization",
  ],
  birthday: ["cumpleanos", "fecha_nacimiento", "fecha_de_nacimiento", "birthday"],
};

function normalizeKey(k: string): string {
  return k
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const FIELD_BY_SYNONYM = new Map<string, ContactField>();
for (const [field, syns] of Object.entries(FIELD_SYNONYMS) as [
  ContactField,
  string[],
][]) {
  for (const s of syns) FIELD_BY_SYNONYM.set(normalizeKey(s), field);
}

/** Mapea los campos de un formulario a campos del contacto por nombres comunes. */
export function mapFlowFieldsToContact(
  fields: Record<string, unknown>,
): Partial<Record<ContactField, string>> {
  const out: Partial<Record<ContactField, string>> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    const value = String(v).trim();
    if (!value) continue;
    const target = FIELD_BY_SYNONYM.get(normalizeKey(k));
    if (target && out[target] === undefined) out[target] = value;
  }
  return out;
}

const isEmpty = (v: string | null | undefined) => v == null || v.trim() === "";

/**
 * Enriquece la ficha del contacto con los campos del formulario, SOLO en los
 * campos que estén vacíos (no pisa datos existentes).
 */
export async function enrichContactFromFlow(
  db: DB,
  contactId: string,
  fields: Record<string, unknown>,
  ts: Date,
): Promise<void> {
  const mapped = mapFlowFieldsToContact(fields);
  if (Object.keys(mapped).length === 0) return;
  const c = (
    await db.select().from(contacts).where(eq(contacts.id, contactId))
  )[0];
  if (!c) return;

  const set: Partial<typeof contacts.$inferInsert> = {};
  if (mapped.name && isEmpty(c.name)) set.name = mapped.name;
  if (mapped.email && isEmpty(c.email)) set.email = mapped.email;
  if (mapped.city && isEmpty(c.city)) set.city = mapped.city;
  if (mapped.company && isEmpty(c.company)) set.company = mapped.company;
  if (mapped.birthday && isEmpty(c.birthday)) set.birthday = mapped.birthday;

  if (Object.keys(set).length === 0) return;
  set.updatedAt = ts;
  await db.update(contacts).set(set).where(eq(contacts.id, contactId));
}

/**
 * Extrae los campos del formulario desde el payload crudo de un mensaje
 * `nfm_reply` (WhatsApp Flow). Devuelve null si no es un flow válido.
 */
export function parseFlowPayload(
  payloadJson: string | null,
): { flowName: string | null; fields: Record<string, unknown> } | null {
  if (!payloadJson) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  const interactive = (raw as Record<string, unknown>)?.interactive as
    | Record<string, unknown>
    | undefined;
  const nfm = interactive?.nfm_reply as Record<string, unknown> | undefined;
  if (!nfm) return null;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(String(nfm.response_json ?? "{}"));
  } catch {
    data = {};
  }
  // flow_token es metadata interna de Meta, no un campo del formulario.
  const fields = { ...data };
  delete fields.flow_token;
  const flowName =
    typeof nfm.name === "string" && nfm.name && nfm.name !== "flow"
      ? nfm.name
      : null;
  return { flowName, fields };
}

/** Persiste una respuesta de formulario de forma estructurada (idempotente por wamid). */
export async function recordFlowResponse(
  db: DB,
  input: {
    orgId: string;
    conversationId: string | null;
    contactId: string | null;
    phone: string;
    contactName: string | null;
    wamid: string | null;
    payloadJson: string | null;
    ts: Date;
  },
): Promise<void> {
  const parsed = parseFlowPayload(input.payloadJson);
  if (!parsed) return;

  // dedupe por wamid
  if (input.wamid) {
    const dup = (
      await db
        .select({ id: flowResponses.id })
        .from(flowResponses)
        .where(eq(flowResponses.wamid, input.wamid))
    )[0];
    if (dup) return;
  }

  await db.insert(flowResponses).values({
    id: randomUUID(),
    orgId: input.orgId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
    contactName: input.contactName,
    flowName: parsed.flowName,
    wamid: input.wamid,
    fieldsJson: JSON.stringify(parsed.fields),
    createdAt: input.ts,
  });

  // Enriquece la ficha del contacto con los campos del formulario (campos vacíos).
  if (input.contactId) {
    await enrichContactFromFlow(db, input.contactId, parsed.fields, input.ts);
  }
}

export async function listFlowResponses(
  db: DB,
  orgId: string,
): Promise<FlowResponseRow[]> {
  return db
    .select()
    .from(flowResponses)
    .where(eq(flowResponses.orgId, orgId))
    .orderBy(desc(flowResponses.createdAt));
}

function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Escapa comillas y envuelve si hay coma/comilla/salto de línea.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Aplana las respuestas a CSV. Las columnas de campos = unión de todas las claves. */
export function flowResponsesToCsv(rows: FlowResponseRow[]): string {
  const fieldKeys = new Set<string>();
  const parsed = rows.map((r) => {
    let fields: Record<string, unknown> = {};
    try {
      fields = JSON.parse(r.fieldsJson);
    } catch {
      fields = {};
    }
    for (const k of Object.keys(fields)) fieldKeys.add(k);
    return { r, fields };
  });
  const keys = Array.from(fieldKeys).sort();
  const header = ["fecha", "telefono", "contacto", "flow", ...keys];
  const lines = [header.map(csvCell).join(",")];
  for (const { r, fields } of parsed) {
    const row = [
      r.createdAt.toISOString(),
      r.phone,
      r.contactName ?? "",
      r.flowName ?? "",
      ...keys.map((k) => fields[k]),
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\n");
}
