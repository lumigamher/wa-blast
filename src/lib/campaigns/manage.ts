import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaigns } from "@/lib/db/schema";

export type ManageResult = { ok: true } | { ok: false; error: string };

async function loadOwned(db: DB, orgId: string, id: string) {
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!camp || camp.orgId !== orgId) return null;
  return camp;
}

export async function cancelCampaign(db: DB, orgId: string, id: string): Promise<ManageResult> {
  const camp = await loadOwned(db, orgId, id);
  if (!camp) return { ok: false, error: "Campaña no encontrada" };
  if (camp.status !== "draft") {
    return { ok: false, error: "Solo se pueden cancelar campañas programadas que aún no han salido" };
  }
  await db.update(campaigns).set({ status: "cancelled" }).where(eq(campaigns.id, id));
  return { ok: true };
}

const DELETABLE = new Set(["draft", "cancelled", "done", "failed"]);

export async function deleteCampaign(db: DB, orgId: string, id: string): Promise<ManageResult> {
  const camp = await loadOwned(db, orgId, id);
  if (!camp) return { ok: false, error: "Campaña no encontrada" };
  if (!DELETABLE.has(camp.status)) {
    return { ok: false, error: "No se puede eliminar una campaña en curso" };
  }
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return { ok: true };
}
