import {
  chatwootApi,
  MESSAGE_STATUS,
  type ChatwootMessage,
  type WhatsAppTemplate,
} from "./chatwoot";
import { db } from "./db";
import { env } from "./env";
import { renderPreview } from "./templates";

const activeBatches = new Set<string>();

export type PendingRow = {
  phone: string;
  name: string | null;
  params: Record<string, string>;
};

export function queueBatch(params: {
  batchId: string;
  token: string;
  template: WhatsAppTemplate;
  rows: PendingRow[];
}) {
  if (activeBatches.has(params.batchId)) return;
  activeBatches.add(params.batchId);
  void runBatch(params).finally(() => {
    activeBatches.delete(params.batchId);
  });
}

async function runBatch({
  batchId,
  token,
  template,
  rows,
}: {
  batchId: string;
  token: string;
  template: WhatsAppTemplate;
  rows: PendingRow[];
}) {
  const updateBatch = db.prepare(
    "UPDATE batches SET status = ?, sent = ?, failed = ? WHERE id = ?",
  );
  const markAccepted = db.prepare(
    "UPDATE batch_items SET status = 'accepted', error = NULL, message_id = ?, conversation_id = ?, sent_at = ? WHERE id = ?",
  );
  const markFailed = db.prepare(
    "UPDATE batch_items SET status = 'failed', error = ?, sent_at = ? WHERE id = ?",
  );
  const getItems = db.prepare(
    "SELECT id, phone, name FROM batch_items WHERE batch_id = ? ORDER BY id",
  );

  updateBatch.run("running", 0, 0, batchId);

  const items = getItems.all(batchId) as Array<{
    id: number;
    phone: string;
    name: string | null;
  }>;

  let accepted = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const item = items[i];
    try {
      const { contact, sourceId } = await resolveContact(
        token,
        row.phone,
        row.name,
      );
      const conv = await chatwootApi.createConversation(token, {
        source_id: sourceId,
        inbox_id: env.CHATWOOT_INBOX_ID,
        contact_id: contact.id,
      });
      const renderedContent = renderPreview(template, row.params);
      const msg = await chatwootApi.sendTemplate(token, conv.id, {
        content: renderedContent,
        template: {
          name: template.name,
          language: template.language,
          category: template.category,
          processed_params: row.params,
        },
      });
      markAccepted.run(msg.id, conv.id, Date.now(), item.id);
      accepted++;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      markFailed.run(err, Date.now(), item.id);
      failed++;
    }
    updateBatch.run("running", accepted, failed, batchId);
    await sleep(500);
  }

  // Chatwoot/Meta entregan status final de forma asíncrona. Esperamos y
  // consultamos cada conversación para reconciliar el estado real.
  await sleep(8000);
  const reconciled = await reconcile(batchId, token);

  updateBatch.run(
    "completed",
    reconciled.sent,
    reconciled.failed,
    batchId,
  );
}

async function reconcile(
  batchId: string,
  token: string,
): Promise<{ sent: number; failed: number }> {
  const rows = db
    .prepare(
      "SELECT id, message_id, conversation_id FROM batch_items WHERE batch_id = ? AND status IN ('accepted','sent','failed') AND conversation_id IS NOT NULL",
    )
    .all(batchId) as Array<{
    id: number;
    message_id: number | null;
    conversation_id: number | null;
  }>;

  const byConv = new Map<number, typeof rows>();
  for (const r of rows) {
    if (!r.conversation_id) continue;
    const list = byConv.get(r.conversation_id) ?? [];
    list.push(r);
    byConv.set(r.conversation_id, list);
  }

  const markSent = db.prepare(
    "UPDATE batch_items SET status = 'sent', error = NULL WHERE id = ?",
  );
  const markFailed = db.prepare(
    "UPDATE batch_items SET status = 'failed', error = ? WHERE id = ?",
  );

  for (const [convId, items] of byConv) {
    try {
      const res = await chatwootApi.listConversationMessages(token, convId);
      const byId = new Map<number, ChatwootMessage>();
      for (const m of res.payload) byId.set(m.id, m);

      for (const it of items) {
        if (it.message_id == null) continue;
        const msg = byId.get(it.message_id);
        if (!msg) continue;
        if (msg.status === MESSAGE_STATUS.FAILED) {
          const err =
            msg.content_attributes?.external_error ?? "delivery failed";
          markFailed.run(err, it.id);
        } else {
          markSent.run(it.id);
        }
      }
    } catch {
      // si falla la reconciliación de una conversación, dejamos el estado previo
    }
    await sleep(300);
  }

  const counts = db
    .prepare(
      "SELECT status, COUNT(*) AS c FROM batch_items WHERE batch_id = ? GROUP BY status",
    )
    .all(batchId) as Array<{ status: string; c: number }>;
  const map = new Map(counts.map((r) => [r.status, r.c]));
  return {
    sent: (map.get("sent") ?? 0) + (map.get("accepted") ?? 0),
    failed: map.get("failed") ?? 0,
  };
}

async function resolveContact(
  token: string,
  phone: string,
  name: string | null,
): Promise<{ contact: { id: number }; sourceId: string }> {
  const whatsappSourceId = phone.replace(/^\+/, "");

  const search = await chatwootApi.searchContactByPhone(token, phone);
  const hit = search.payload.find((c) => c.phone_number === phone);

  if (!hit) {
    const created = await chatwootApi.createContact(token, {
      name: name ?? phone,
      phone_number: phone,
      inbox_id: env.CHATWOOT_INBOX_ID,
    });
    return { contact: created.payload.contact, sourceId: whatsappSourceId };
  }

  const existing = hit.contact_inboxes?.find(
    (ci) => ci.inbox.id === env.CHATWOOT_INBOX_ID,
  );
  if (existing) {
    return { contact: hit, sourceId: existing.source_id };
  }

  await chatwootApi.createContactInbox(token, hit.id, {
    inbox_id: env.CHATWOOT_INBOX_ID,
    source_id: whatsappSourceId,
  });
  return { contact: hit, sourceId: whatsappSourceId };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
