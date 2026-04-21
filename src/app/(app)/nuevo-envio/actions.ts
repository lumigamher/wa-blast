"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { chatwootApi } from "@/lib/chatwoot";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { queueBatch, type PendingRow } from "@/lib/sender";
import { getSession } from "@/lib/session";
import { isSendable } from "@/lib/templates";

export async function fetchApprovedTemplates() {
  const session = await getSession();
  if (!session.user) return [];
  const templates = await chatwootApi.listTemplates(session.user.chatwootToken);
  return templates.filter(isSendable);
}

const rowSchema = z.object({
  phone: z.string(),
  name: z.string().optional().nullable(),
  params: z.record(z.string(), z.string()),
});

const payloadSchema = z.object({
  templateName: z.string(),
  templateLanguage: z.string(),
  rows: z.array(rowSchema).min(1).max(1000),
});

export type CreateBatchResult =
  | { ok: true; batchId: string }
  | { ok: false; error: string };

export async function createBatch(
  input: unknown,
): Promise<CreateBatchResult> {
  const session = await getSession();
  if (!session.user) return { ok: false, error: "No autenticado" };

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }

  const { templateName, templateLanguage, rows } = parsed.data;

  const templates = await chatwootApi.listTemplates(
    session.user.chatwootToken,
  );
  const template = templates.find(
    (t) => t.name === templateName && t.language === templateLanguage,
  );
  if (!template) return { ok: false, error: "Plantilla no encontrada" };
  if (!isSendable(template)) {
    return { ok: false, error: "La plantilla no está aprobada" };
  }

  const normalized: PendingRow[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    if (!phone) continue;
    normalized.push({
      phone,
      name: r.name ?? null,
      params: r.params,
    });
  }
  if (normalized.length === 0) {
    return { ok: false, error: "Ninguna fila tiene teléfono válido" };
  }

  const batchId = randomUUID();
  const insertBatch = db.prepare(`
    INSERT INTO batches
      (id, created_at, user_email, template_name, template_language, total, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  const insertItem = db.prepare(`
    INSERT INTO batch_items (batch_id, phone, name, params, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const tx = db.transaction(() => {
    insertBatch.run(
      batchId,
      Date.now(),
      session.user!.email,
      template.name,
      template.language,
      normalized.length,
    );
    for (const row of normalized) {
      insertItem.run(
        batchId,
        row.phone,
        row.name,
        JSON.stringify(row.params),
      );
    }
  });
  tx();

  queueBatch({
    batchId,
    token: session.user.chatwootToken,
    template,
    rows: normalized,
  });

  redirect(`/historial/${batchId}`);
}
