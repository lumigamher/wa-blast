"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { contactTags, contacts, tags } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { parseContactsFile, validateRows } from "@/lib/contacts/import";
import { upsertContacts } from "@/lib/contacts/upsert";

export type ContactWithTags = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  optOutAt: Date | null;
  tagList: { id: string; name: string; color: string }[];
};

export async function listContactsAction(q?: string): Promise<ContactWithTags[]> {
  const { orgId } = await requireOrg();
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        q
          ? sql`(${contacts.name} LIKE ${"%" + q + "%"} OR ${contacts.phone} LIKE ${"%" + q + "%"})`
          : sql`1=1`,
      ),
    )
    .limit(500);

  if (rows.length === 0) return [];

  const contactIds = rows.map((r) => r.id);
  const tagMaps = await db
    .select({
      contactId: contactTags.contactId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(inArray(contactTags.contactId, contactIds));

  const byContact = new Map<string, { id: string; name: string; color: string }[]>();
  for (const t of tagMaps) {
    const list = byContact.get(t.contactId) ?? [];
    list.push({ id: t.id, name: t.name, color: t.color });
    byContact.set(t.contactId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    email: r.email,
    optOutAt: r.optOutAt,
    tagList: byContact.get(r.id) ?? [],
  }));
}

export async function dryRunImportAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const file = formData.get("file") as File;
  const parsed = await parseContactsFile(file);

  const mapping = {
    phoneCol: String(formData.get("phoneCol") ?? ""),
    nameCol: String(formData.get("nameCol") ?? "") || undefined,
    emailCol: String(formData.get("emailCol") ?? "") || undefined,
    customCols: String(formData.get("customCols") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    defaultCountry: settings.defaultCountry,
  };

  const validation = validateRows(parsed.rows, mapping);
  return { headers: parsed.headers, ...validation };
}

export async function confirmImportAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const file = formData.get("file") as File;
  const parsed = await parseContactsFile(file);

  const mapping = {
    phoneCol: String(formData.get("phoneCol") ?? ""),
    nameCol: String(formData.get("nameCol") ?? "") || undefined,
    emailCol: String(formData.get("emailCol") ?? "") || undefined,
    customCols: String(formData.get("customCols") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    defaultCountry: settings.defaultCountry,
  };

  const { valid } = validateRows(parsed.rows, mapping);
  const result = await upsertContacts(db, orgId, valid);
  revalidatePath("/contactos");
  return result;
}
