"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { validateRows } from "@/lib/contacts/import";
import { upsertContacts } from "@/lib/contacts/upsert";
import { db } from "@/lib/db/client";
import { contacts, contactTags, tags } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import {
	createContact,
	updateContact,
	deleteContact,
	setContactTagsForOrg,
	getContact,
	type ContactPatch,
} from "@/lib/contacts/mutations";

export type ContactWithTags = {
	id: string;
	phone: string | null;
	name: string | null;
	email: string | null;
	company: string | null;
	optOutAt: Date | null;
	tagList: { id: string; name: string; color: string }[];
};

export type ContactFilters = {
	q?: string;
	status?: "activos" | "optout";
	tagId?: string;
};

export async function listContactsAction(
	filters?: ContactFilters | string,
): Promise<ContactWithTags[]> {
	// Retrocompat: acepta un string suelto como búsqueda.
	const f: ContactFilters = typeof filters === "string" ? { q: filters } : (filters ?? {});
	const { orgId } = await requireOrg();
	const rows = await db
		.select()
		.from(contacts)
		.where(
			and(
				eq(contacts.orgId, orgId),
				f.q
					? sql`(${contacts.name} LIKE ${"%" + f.q + "%"} OR ${contacts.phone} LIKE ${"%" + f.q + "%"} OR ${contacts.username} LIKE ${"%" + f.q + "%"})`
					: sql`1=1`,
				f.status === "activos" ? sql`${contacts.optOutAt} IS NULL` : sql`1=1`,
				f.status === "optout" ? sql`${contacts.optOutAt} IS NOT NULL` : sql`1=1`,
				f.tagId
					? sql`EXISTS (SELECT 1 FROM ${contactTags} WHERE ${contactTags.contactId} = ${contacts.id} AND ${contactTags.tagId} = ${f.tagId})`
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

	const byContact = new Map<
		string,
		{ id: string; name: string; color: string }[]
	>();
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
		company: r.company,
		optOutAt: r.optOutAt,
		tagList: byContact.get(r.id) ?? [],
	}));
}

export type ImportMapping = {
	phoneCol: string;
	nameCol?: string;
	emailCol?: string;
	customCols: string[];
};

export async function validateImportAction(
	rows: Record<string, string>[],
	mapping: ImportMapping,
) {
	const { orgId } = await requireOrg();
	const settings = await getOrgSettings(db, orgId);
	return validateRows(rows, {
		...mapping,
		defaultCountry: settings.defaultCountry,
	});
}

export async function commitImportAction(
	rows: Record<string, string>[],
	mapping: ImportMapping,
) {
	const { orgId } = await requireOrg();
	const settings = await getOrgSettings(db, orgId);
	const { valid } = validateRows(rows, {
		...mapping,
		defaultCountry: settings.defaultCountry,
	});
	const result = await upsertContacts(db, orgId, valid);
	revalidatePath("/contactos");
	return { ...result, totalValid: valid.length };
}

export async function toggleOptOutAction(
	contactId: string,
): Promise<{ ok: boolean; optedOut?: boolean }> {
	const { orgId } = await requireOrg();
	const [row] = await db
		.select({ id: contacts.id, optOutAt: contacts.optOutAt })
		.from(contacts)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
	if (!row) return { ok: false };
	const optedOut = !row.optOutAt;
	await db
		.update(contacts)
		.set({ optOutAt: optedOut ? new Date() : null })
		.where(eq(contacts.id, contactId));
	revalidatePath("/contactos");
	return { ok: true, optedOut };
}

export async function createContactAction(input: {
	phone: string | null;
	name?: string;
	email?: string;
	company?: string;
	tagIds?: string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string; existingId?: string }> {
	const { orgId } = await requireOrg();
	const settings = await getOrgSettings(db, orgId);
	const res = await createContact(db, orgId, settings.defaultCountry, input);
	if (res.ok) revalidatePath("/contactos");
	return res;
}

export async function updateContactAction(
	id: string,
	patch: ContactPatch,
): Promise<{ ok: boolean; error?: string }> {
	const { orgId } = await requireOrg();
	const res = await updateContact(db, orgId, id, patch);
	if (res.ok) {
		revalidatePath("/contactos");
		revalidatePath(`/contactos/${id}`);
	}
	return res;
}

export async function deleteContactAction(id: string): Promise<{ ok: boolean }> {
	const { orgId } = await requireOrg();
	const res = await deleteContact(db, orgId, id);
	revalidatePath("/contactos");
	return res;
}

export async function setContactTagsAction(
	id: string,
	tagIds: string[],
): Promise<{ ok: boolean; error?: string }> {
	const { orgId } = await requireOrg();
	const res = await setContactTagsForOrg(db, orgId, id, tagIds);
	if (res.ok) {
		revalidatePath("/contactos");
		revalidatePath(`/contactos/${id}`);
	}
	return res;
}

export async function getContactAction(id: string) {
	const { orgId } = await requireOrg();
	return getContact(db, orgId, id);
}

export async function listTagsAction() {
	const { orgId } = await requireOrg();
	const { listTags } = await import("@/lib/contacts/tags");
	return listTags(db, orgId);
}
