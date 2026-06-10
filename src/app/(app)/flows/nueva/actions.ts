"use server";

import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, MetaApiError } from "@/lib/meta/graph";
import { createAndPublishFlow, createFlow, getFlowPreview, type FlowCategory } from "@/lib/meta/flows";
import { generateFlowJson } from "@/lib/flow-ai";
import { sendFlow } from "@/lib/meta/client";
import { createCampaign } from "@/lib/campaigns/create";
import { getWorker } from "@/lib/campaigns/worker";

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

export type PreviewFlowResult = { ok: true; flowId: string; previewUrl: string } | { ok: false; error: string };
export async function previewFlowAction(input: { name: string; flowJson: string }): Promise<PreviewFlowResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura tus credenciales de Meta primero" };
  try {
    JSON.parse(input.flowJson);
  } catch {
    return { ok: false, error: "El Flow JSON no es válido" };
  }
  try {
    const { id } = await createFlow(creds, { name: input.name || "Borrador preview", categories: ["LEAD_GENERATION"], flowJson: input.flowJson });
    const { previewUrl } = await getFlowPreview(creds, id);
    return { ok: true, flowId: id, previewUrl };
  } catch (e) {
    if (e instanceof MetaApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al previsualizar" };
  }
}

export type SendFlowResult = { ok: true; wamid: string } | { ok: false; error: string };
export async function sendFlowAction(input: {
  flowId: string;
  flowName: string;
  to: string;
  cta: string;
  bodyText: string;
}): Promise<SendFlowResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);

  const to = input.to.trim();
  if (!to) return { ok: false, error: "Falta el número de destino" };
  if (!input.cta.trim()) return { ok: false, error: "Falta el texto del botón (CTA)" };
  if (!input.bodyText.trim()) return { ok: false, error: "Falta el mensaje" };

  try {
    const result = await sendFlow(settings, {
      to,
      flowId: input.flowId,
      cta: input.cta,
      bodyText: input.bodyText,
    });

    if ("error" in result) {
      const msg = result.error.type === "outside_24h"
        ? "El cliente debe haberte escrito en las últimas 24h"
        : result.error.message;
      return { ok: false, error: msg };
    }

    return { ok: true, wamid: result.wamid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al enviar" };
  }
}

export type SendFlowBatchResult = { ok: true; campaignId: string; total: number } | { ok: false; error: string };
export async function sendFlowBatchAction(input: {
  flowId: string;
  flowName: string;
  cta: string;
  bodyText: string;
  phones: string[];
}): Promise<SendFlowBatchResult> {
  const { orgId, session } = await requireOrg();

  if (!input.cta.trim()) return { ok: false, error: "Falta el texto del botón (CTA)" };
  if (!input.bodyText.trim()) return { ok: false, error: "Falta el mensaje" };

  const phones = [
    ...new Set(
      input.phones
        .map((p) => p.replace(/[^0-9+]/g, "").trim())
        .filter((p) => p.length >= 7),
    ),
  ];
  if (phones.length === 0) return { ok: false, error: "Agrega al menos un número válido" };

  try {
    const planJson = JSON.stringify({
      kind: "flow",
      flowId: input.flowId,
      cta: input.cta,
      bodyText: input.bodyText,
    });

    const { campaignId, total } = await createCampaign(db, {
      orgId,
      createdBy: session.user.id,
      name: input.flowName,
      templateName: input.flowName,
      templateLanguage: "es_CO",
      headerType: "NONE",
      componentPlanJson: planJson,
      source: "adhoc",
      recipients: phones.map((phone) => ({ phone, params: {} })),
    });

    // Kick off the worker (fire-and-forget)
    void getWorker(db)
      .runCampaign(campaignId)
      .catch((e) => console.error("flow sender error", e));

    return { ok: true, campaignId, total };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear la campaña" };
  }
}
