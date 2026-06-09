"use server";

import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, MetaApiError } from "@/lib/meta/graph";
import { createAndPublishFlow, type FlowCategory } from "@/lib/meta/flows";
import { generateFlowJson } from "@/lib/flow-ai";

export type GenerateFlowResult = { ok: true; flowJson: string } | { ok: false; error: string };
export async function generateFlowAction(request: string): Promise<GenerateFlowResult> {
  await requireOrg();
  if (!request.trim()) return { ok: false, error: "Describe el formulario que quieres" };
  try {
    return { ok: true, flowJson: await generateFlowJson(request) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al generar" };
  }
}

export type CreateFlowResult = { ok: true; id: string; status: string } | { ok: false; error: string };
export async function createFlowAction(input: { name: string; category: FlowCategory; flowJson: string }): Promise<CreateFlowResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura tus credenciales de Meta primero" };
  if (!input.name.trim()) return { ok: false, error: "Ponle un nombre al Flow" };
  try {
    JSON.parse(input.flowJson);
  } catch {
    return { ok: false, error: "El Flow JSON no es válido" };
  }
  try {
    const res = await createAndPublishFlow(creds, { name: input.name, categories: [input.category], flowJson: input.flowJson });
    return { ok: true, id: res.id, status: res.status };
  } catch (e) {
    if (e instanceof MetaApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear" };
  }
}
