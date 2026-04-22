"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { templateFavorites } from "@/lib/db/schema";

export type ToggleFavoriteResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string };

export async function toggleFavoriteAction(
  name: string,
  language: string,
): Promise<ToggleFavoriteResult> {
  const { orgId, session } = await requireOrg();
  if (!name || !language) return { ok: false, error: "parámetros inválidos" };

  const existing = await db
    .select()
    .from(templateFavorites)
    .where(
      and(
        eq(templateFavorites.orgId, orgId),
        eq(templateFavorites.userId, session.user.id),
        eq(templateFavorites.templateName, name),
        eq(templateFavorites.templateLanguage, language),
      ),
    );

  let favorited: boolean;
  if (existing.length > 0) {
    await db
      .delete(templateFavorites)
      .where(
        and(
          eq(templateFavorites.orgId, orgId),
          eq(templateFavorites.userId, session.user.id),
          eq(templateFavorites.templateName, name),
          eq(templateFavorites.templateLanguage, language),
        ),
      );
    favorited = false;
  } else {
    await db.insert(templateFavorites).values({
      orgId,
      userId: session.user.id,
      templateName: name,
      templateLanguage: language,
      createdAt: new Date(),
    });
    favorited = true;
  }

  revalidatePath("/plantillas");
  revalidatePath("/campanas/nueva");
  return { ok: true, favorited };
}
