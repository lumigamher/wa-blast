import { and, count, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentDocuments, documentChunks } from "@/lib/db/schema";

export async function listDocuments(db: DB, orgId: string) {
  return db
    .select({
      id: agentDocuments.id, name: agentDocuments.name, source: agentDocuments.source,
      status: agentDocuments.status, chunkCount: agentDocuments.chunkCount, bytes: agentDocuments.bytes,
      errorMessage: agentDocuments.errorMessage, createdAt: agentDocuments.createdAt,
    })
    .from(agentDocuments)
    .where(eq(agentDocuments.orgId, orgId))
    .orderBy(desc(agentDocuments.createdAt));
}
export async function countDocuments(db: DB, orgId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(agentDocuments).where(eq(agentDocuments.orgId, orgId));
  return row?.n ?? 0;
}
export async function countChunks(db: DB, orgId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(documentChunks).where(eq(documentChunks.orgId, orgId));
  return row?.n ?? 0;
}
export async function orgHasDocuments(db: DB, orgId: string): Promise<boolean> {
  return (await countChunks(db, orgId)) > 0;
}
export async function deleteDocument(db: DB, orgId: string, documentId: string): Promise<void> {
  await db.delete(agentDocuments).where(and(eq(agentDocuments.id, documentId), eq(agentDocuments.orgId, orgId)));
}
