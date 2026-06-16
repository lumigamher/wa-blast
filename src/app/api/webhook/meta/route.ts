import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { verifyMetaSignature, webhookPayloadSchema } from "@/lib/meta/webhook";
import { handleInboundMessage, handleStatusEvent, handleCallEvent, handleCallPermissionReply } from "@/lib/meta/webhook-handlers";
import { forwardWebhook } from "@/lib/meta/forward";
import { resolveOrgByPhoneId } from "@/lib/org/resolve-by-phone-id";
import { logCallWebhook } from "@/lib/meta/call-webhook-log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("bad request", { status: 400 });
  }

  const settings = await db.query.organizationSettings.findFirst({
    where: (t, { eq }) => eq(t.metaVerifyToken, token),
  });

  if (!settings) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256");

  let parsed;
  try {
    parsed = webhookPayloadSchema.safeParse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  if (!parsed.success) return NextResponse.json({ ok: true }, { status: 200 });

  const firstChange = parsed.data.entry[0]?.changes[0]?.value;
  const phoneId = firstChange?.metadata?.phone_number_id;
  if (!phoneId) return NextResponse.json({ ok: true });

  const settings = await resolveOrgByPhoneId(db, phoneId);
  if (!settings || !settings.metaAppSecret) {
    return NextResponse.json({ ok: true });
  }

  if (!verifyMetaSignature(rawBody, sigHeader, settings.metaAppSecret)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  logCallWebhook(rawBody); // TEMPORAL: observabilidad de llamadas/permiso (ver call-webhook-log.ts)

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const v = change.value;
      if (v.statuses) {
        for (const s of v.statuses) await handleStatusEvent(db, settings.orgId, s);
      }
      if (v.messages) {
        const profileName = v.contacts?.[0]?.profile?.name ?? null;
        for (const m of v.messages) {
          // Reply al permiso de llamada (forma exacta a verificar contra doc Meta; parseo tolerante).
          const inter = (m as Record<string, unknown>).interactive as
            | { type?: string; call_permission_reply?: { response?: string; expiration_timestamp?: number } }
            | undefined;
          const reply = inter?.call_permission_reply;
          if (inter?.type?.includes("call_permission") && reply?.response) {
            await handleCallPermissionReply(db, settings.orgId, {
              fromPhone: String((m as Record<string, unknown>).from ?? ""),
              response: reply.response,
              expirationTs: reply.expiration_timestamp,
            });
            continue;
          }
          await handleInboundMessage(db, settings.orgId, m, settings.optoutKeywords, profileName);
        }
      }
      if (v.calls) {
        for (const c of v.calls) await handleCallEvent(db, settings.orgId, c);
      }
    }
  }

  if (settings.forwardUrl) {
    const fwdHeaders: Record<string, string> = {};
    if (sigHeader) fwdHeaders["x-hub-signature-256"] = sigHeader;
    void forwardWebhook(fetch, settings.forwardUrl, rawBody, fwdHeaders).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
