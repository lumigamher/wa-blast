import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contactTags, tags } from "@/lib/db/schema";

export async function listTags(db: DB, orgId: string) {
  return db.select().from(tags).where(eq(tags.orgId, orgId));
}

export async function createTag(db: DB, orgId: string, name: string, color: string) {
  const id = `tag_${crypto.randomUUID()}`;
  await db.insert(tags).values({ id, orgId, name, color });
  return id;
}

export async function deleteTag(db: DB, orgId: string, tagId: string) {
  await db.delete(tags).where(and(eq(tags.orgId, orgId), eq(tags.id, tagId)));
}

export async function setContactTags(db: DB, contactId: string, tagIds: string[]) {
  db.transaction((tx) => {
    tx.delete(contactTags).where(eq(contactTags.contactId, contactId)).run();
    if (tagIds.length > 0) {
      tx.insert(contactTags).values(tagIds.map((t) => ({ contactId, tagId: t }))).run();
    }
  });
}
