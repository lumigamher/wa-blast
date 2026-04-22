"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { createTag, deleteTag } from "@/lib/contacts/tags";

export async function createTagAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#888888");
  if (!name) return;
  await createTag(db, orgId, name, color);
  revalidatePath("/contactos/tags");
}

export async function deleteTagAction(tagId: string) {
  const { orgId } = await requireOrg();
  await deleteTag(db, orgId, tagId);
  revalidatePath("/contactos/tags");
}
