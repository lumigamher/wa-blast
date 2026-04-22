"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { contacts } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { parseContactsFile, validateRows } from "@/lib/contacts/import";
import { upsertContacts } from "@/lib/contacts/upsert";

export async function listContactsAction(q?: string) {
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
  return rows;
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
