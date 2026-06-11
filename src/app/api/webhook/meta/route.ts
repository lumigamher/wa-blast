import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { verifyMetaSignature, webhookPayloadSchema } from "@/lib/meta/webhook";
import { handleInboundMessage, handleStatusEvent } from "@/lib/meta/webhook-handlers";
import { forwardWebhook } from "@/lib/meta/forward";
import { resolveOrgByPhoneId } from "@/lib/org/resolve-by-phone-id";

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

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const v = change.value;
      if (v.statuses) {
        for (const s of v.statuses) await handleStatusEvent(db, settings.orgId, s);
      }
      if (v.messages) {
        for (const m of v.messages) await handleInboundMessage(db, settings.orgId, m, settings.optoutKeywords);
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
