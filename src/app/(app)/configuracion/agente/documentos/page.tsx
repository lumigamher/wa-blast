import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listDocuments } from "@/lib/agent/rag/admin";
import { AgentDocuments } from "../_documents";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const { orgId } = await requireOrg();

  const documentList = await listDocuments(db, orgId);

  return (
    <AgentDocuments
      items={documentList.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        chunkCount: d.chunkCount,
        source: d.source,
      }))}
    />
  );
}
