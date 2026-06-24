import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import {
  conversationLabelLinks,
  conversationLabels,
  conversations,
} from "@/lib/db/schema";

export type Label = { id: string; name: string; color: string };

export async function listLabels(db: DB, orgId: string): Promise<Label[]> {
  return db
    .select({
      id: conversationLabels.id,
      name: conversationLabels.name,
      color: conversationLabels.color,
    })
    .from(conversationLabels)
    .where(eq(conversationLabels.orgId, orgId))
    .orderBy(conversationLabels.name);
}

export async function createLabel(
  db: DB,
  orgId: string,
  input: { name: string; color: string }
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Nombre de etiqueta requerido");
  const existing = await db
    .select({ id: conversationLabels.id })
    .from(conversationLabels)
    .where(
      and(
        eq(conversationLabels.orgId, orgId),
        eq(sql`lower(${conversationLabels.name})`, name.toLowerCase())
      )
    );
  if (existing.length) throw new Error("Ya existe una etiqueta con ese nombre");
  const id = randomUUID();
  await db.insert(conversationLabels).values({
    id,
    orgId,
    name,
    color: input.color || "#6366f1",
    createdAt: new Date(),
  });
  return id;
}

export async function deleteLabel(
  db: DB,
  orgId: string,
  labelId: string
): Promise<void> {
  // links se borran por ON DELETE cascade
  await db
    .delete(conversationLabels)
    .where(
      and(
        eq(conversationLabels.id, labelId),
        eq(conversationLabels.orgId, orgId)
      )
    );
}

async function assertConvInOrg(
  db: DB,
  orgId: string,
  conversationId: string
): Promise<boolean> {
  const r = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.orgId, orgId)
      )
    );
  return r.length > 0;
}

export async function getConversationLabels(
  db: DB,
  orgId: string,
  conversationId: string
): Promise<Label[]> {
  return db
    .select({
      id: conversationLabels.id,
      name: conversationLabels.name,
      color: conversationLabels.color,
    })
    .from(conversationLabelLinks)
    .innerJoin(
      conversationLabels,
      eq(conversationLabelLinks.labelId, conversationLabels.id)
    )
    .where(
      and(
        eq(conversationLabelLinks.conversationId, conversationId),
        eq(conversationLabels.orgId, orgId)
      )
    )
    .orderBy(conversationLabels.name);
}

export async function setConversationLabels(
  db: DB,
  orgId: string,
  conversationId: string,
  labelIds: string[]
): Promise<void> {
  if (!(await assertConvInOrg(db, orgId, conversationId))) {
    throw new Error("Conversación no encontrada");
  }
  // valida que las labels son de la org
  const valid = labelIds.length
    ? (
        await db
          .select({ id: conversationLabels.id })
          .from(conversationLabels)
          .where(
            and(
              eq(conversationLabels.orgId, orgId),
              inArray(conversationLabels.id, labelIds)
            )
          )
      ).map((r) => r.id)
    : [];
  await db
    .delete(conversationLabelLinks)
    .where(eq(conversationLabelLinks.conversationId, conversationId));
  if (valid.length) {
    await db
      .insert(conversationLabelLinks)
      .values(valid.map((labelId) => ({ conversationId, labelId })));
  }
}

export async function labelsByConversation(
  db: DB,
  orgId: string,
  conversationIds: string[]
): Promise<Record<string, Label[]>> {
  const out: Record<string, Label[]> = {};
  if (!conversationIds.length) return out;
  const rows = await db
    .select({
      conversationId: conversationLabelLinks.conversationId,
      id: conversationLabels.id,
      name: conversationLabels.name,
      color: conversationLabels.color,
    })
    .from(conversationLabelLinks)
    .innerJoin(
      conversationLabels,
      eq(conversationLabelLinks.labelId, conversationLabels.id)
    )
    .where(
      and(
        eq(conversationLabels.orgId, orgId),
        inArray(conversationLabelLinks.conversationId, conversationIds)
      )
    );
  for (const r of rows) {
    (out[r.conversationId] ??= []).push({
      id: r.id,
      name: r.name,
      color: r.color,
    });
  }
  return out;
}
