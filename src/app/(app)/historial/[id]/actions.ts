"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { chatwootApi } from "@/lib/chatwoot";
import { db, type BatchItemRow, type BatchRow } from "@/lib/db";
import { queueBatch, type PendingRow } from "@/lib/sender";
import { getSession } from "@/lib/session";
import { isSendable } from "@/lib/templates";

export type RetryResult =
  | { ok: true; batchId: string }
  | { ok: false; error: string };

export async function retryFailedAction(
  originalBatchId: string,
): Promise<RetryResult> {
  const session = await getSession();
  if (!session.user) return { ok: false, error: "No autenticado" };

  const original = db
    .prepare("SELECT * FROM batches WHERE id = ?")
    .get(originalBatchId) as BatchRow | undefined;
  if (!original) return { ok: false, error: "Batch no encontrado" };

  const failed = db
    .prepare(
      "SELECT phone, name, params FROM batch_items WHERE batch_id = ? AND status = 'failed' ORDER BY id",
    )
    .all(originalBatchId) as Pick<BatchItemRow, "phone" | "name" | "params">[];

  if (failed.length === 0) {
    return { ok: false, error: "Este batch no tiene fallidos que reintentar" };
  }

  const templates = await chatwootApi.listTemplates(session.user.chatwootToken);
  const template = templates.find(
    (t) =>
      t.name === original.template_name &&
      t.language === original.template_language,
  );
  if (!template) {
    return {
      ok: false,
      error: "La plantilla original ya no existe en Chatwoot",
    };
  }
  if (!isSendable(template)) {
    return {
      ok: false,
      error: `La plantilla está ${template.status} en Meta, no se puede enviar`,
    };
  }

  const rows: PendingRow[] = failed.map((r) => ({
    phone: r.phone,
    name: r.name ?? null,
    params: JSON.parse(r.params) as Record<string, string>,
  }));

  const newBatchId = randomUUID();
  const insertBatch = db.prepare(`
    INSERT INTO batches
      (id, created_at, user_email, template_name, template_language, total, status, retry_of)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO batch_items (batch_id, phone, name, params, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const tx = db.transaction(() => {
    insertBatch.run(
      newBatchId,
      Date.now(),
      session.user!.email,
      template.name,
      template.language,
      rows.length,
      originalBatchId,
    );
    for (const r of rows) {
      insertItem.run(
        newBatchId,
        r.phone,
        r.name,
        JSON.stringify(r.params),
      );
    }
  });
  tx();

  queueBatch({
    batchId: newBatchId,
    token: session.user.chatwootToken,
    template,
    rows,
  });

  return { ok: true, batchId: newBatchId };
}

export async function goToBatch(batchId: string) {
  redirect(`/historial/${batchId}`);
}
