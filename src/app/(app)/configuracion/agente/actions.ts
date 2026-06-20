"use server";
import { revalidatePath } from "next/cache";
import { setAgentTool, updateAgentConfig, saveCalendar } from "@/lib/agent/admin";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function saveAgentConfigAction(
  input: Parameters<typeof updateAgentConfig>[2],
): Promise<{ ok: true }> {
  const { orgId } = await requireOrg();
  await updateAgentConfig(db, orgId, input);
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function setAgentToolAction(
  key: string,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setAgentTool(db, orgId, key, enabled);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}

export async function saveCalendarAction(input: {
  provider: "calcom" | "calendly" | "google";
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
  timezone: string;
}): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await saveCalendar(db, orgId, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente");
  return { ok: true };
}
