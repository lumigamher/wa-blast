import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { normalizePhone } from "@/lib/contacts/phone";
import type { DB } from "@/lib/db/client";
import { contacts, contactTags, conversations, tags } from "@/lib/db/schema";

const emailSchema = z.email();

export type CreateContactInput = {
	phone: string;
	name?: string | null;
	email?: string | null;
	company?: string | null;
	tagIds?: string[];
};

export type ContactPatch = {
	name?: string | null;
	email?: string | null;
	company?: string | null;
	notes?: string | null;
	birthday?: string | null;
	city?: string | null;
	customFields?: Record<string, unknown>;
};

function clean(v: string | null | undefined): string | null {
	const t = (v ?? "").trim();
	return t === "" ? null : t;
}

export async function createContact(
	db: DB,
	orgId: string,
	defaultCountry: string,
	input: CreateContactInput,
): Promise<
	{ ok: true; id: string } | { ok: false; error: string; existingId?: string }
> {
	const phone = normalizePhone(input.phone ?? "", defaultCountry);
	if (!phone) return { ok: false, error: "Teléfono inválido" };
	const email = clean(input.email);
	if (email && !emailSchema.safeParse(email).success) {
		return { ok: false, error: "Email inválido" };
	}
	const [existing] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone)));
	if (existing)
		return {
			ok: false,
			error: "Ya existe un contacto con ese teléfono",
			existingId: existing.id,
		};

	const id = `c_${crypto.randomUUID()}`;
	const now = new Date();
	const validTags = await validTagIds(db, orgId, input.tagIds ?? []);
	db.transaction((tx) => {
		tx.insert(contacts)
			.values({
				id,
				orgId,
				phone,
				name: clean(input.name),
				email,
				company: clean(input.company),
				customFields: "{}",
				createdAt: now,
				updatedAt: now,
			})
			.run();
		if (validTags.length) {
			tx.insert(contactTags)
				.values(validTags.map((t) => ({ contactId: id, tagId: t })))
				.run();
		}
	});
	return { ok: true, id };
}

export async function updateContact(
	db: DB,
	orgId: string,
	id: string,
	patch: ContactPatch,
): Promise<{ ok: boolean; error?: string }> {
	const [row] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
	if (!row) return { ok: false, error: "Contacto no encontrado" };
	if (patch.email !== undefined) {
		const email = clean(patch.email);
		if (email && !emailSchema.safeParse(email).success)
			return { ok: false, error: "Email inválido" };
	}
	const set: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.name !== undefined) set.name = clean(patch.name);
	if (patch.email !== undefined) set.email = clean(patch.email);
	if (patch.company !== undefined) set.company = clean(patch.company);
	if (patch.notes !== undefined) set.notes = patch.notes ?? null;
	if (patch.birthday !== undefined) set.birthday = clean(patch.birthday);
	if (patch.city !== undefined) set.city = clean(patch.city);
	if (patch.customFields !== undefined) {
		const current = JSON.parse(row.customFields || "{}") as Record<
			string,
			unknown
		>;
		set.customFields = JSON.stringify({ ...current, ...patch.customFields });
	}
	await db
		.update(contacts)
		.set(set)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
	return { ok: true };
}

export async function deleteContact(
	db: DB,
	orgId: string,
	id: string,
): Promise<{ ok: boolean }> {
	await db
		.delete(contacts)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
	return { ok: true };
}

async function validTagIds(
	db: DB,
	orgId: string,
	tagIds: string[],
): Promise<string[]> {
	if (tagIds.length === 0) return [];
	const owned = await db
		.select({ id: tags.id })
		.from(tags)
		.where(and(eq(tags.orgId, orgId), inArray(tags.id, tagIds)));
	const ownedIds = new Set(owned.map((t) => t.id));
	return tagIds.filter((t) => ownedIds.has(t));
}

export async function setContactTagsForOrg(
	db: DB,
	orgId: string,
	contactId: string,
	tagIds: string[],
): Promise<{ ok: boolean; error?: string }> {
	const [c] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
	if (!c) return { ok: false, error: "Contacto no encontrado" };
	const valid = await validTagIds(db, orgId, tagIds);
	db.transaction((tx) => {
		tx.delete(contactTags).where(eq(contactTags.contactId, contactId)).run();
		if (valid.length) {
			tx.insert(contactTags)
				.values(valid.map((t) => ({ contactId, tagId: t })))
				.run();
		}
	});
	return { ok: true };
}

export async function getContact(db: DB, orgId: string, id: string) {
	const [row] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)));
	if (!row) return null;
	const tagList = await db
		.select({ id: tags.id, name: tags.name, color: tags.color })
		.from(contactTags)
		.innerJoin(tags, eq(tags.id, contactTags.tagId))
		.where(eq(contactTags.contactId, id));
	const [conversation] = await db
		.select({
			id: conversations.id,
			lastMessageAt: conversations.lastMessageAt,
		})
		.from(conversations)
		.where(and(eq(conversations.orgId, orgId), eq(conversations.contactId, id)))
		.orderBy(desc(conversations.lastMessageAt))
		.limit(1);
	return { ...row, tagList, conversation: conversation ?? null };
}
