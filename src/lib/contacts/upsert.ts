import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema";

export type ContactInput = {
  phone: string;
  name?: string | null;
  email?: string | null;
  customFields?: Record<string, unknown>;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
};

export async function upsertContacts(db: DB, orgId: string, rows: ContactInput[]): Promise<UpsertResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const phones = rows.map((r) => r.phone);
  const existing = await db
    .select({ id: contacts.id, phone: contacts.phone })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), inArray(contacts.phone, phones)));

  const existingByPhone = new Map(existing.map((e) => [e.phone, e.id]));
  const now = new Date();
  let inserted = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const existingId = existingByPhone.get(r.phone);
      if (existingId) {
        await tx
          .update(contacts)
          .set({
            name: r.name ?? null,
            email: r.email ?? null,
            customFields: JSON.stringify(r.customFields ?? {}),
            updatedAt: now,
          })
          .where(eq(contacts.id, existingId));
        updated++;
      } else {
        await tx.insert(contacts).values({
          id: `c_${crypto.randomUUID()}`,
          orgId,
          phone: r.phone,
          name: r.name ?? null,
          email: r.email ?? null,
          customFields: JSON.stringify(r.customFields ?? {}),
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
      }
    }
  });

  return { inserted, updated };
}
