import { NextResponse } from "next/server";
import { handleEfipayWebhook } from "@/lib/billing/efipay-webhook";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const token = env.EFIPAY_WEBHOOK_TOKEN;
  if (!token) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const rawBody = await req.text();
  const signature = req.headers.get("signature");
  const result = await handleEfipayWebhook(db, rawBody, signature, token);
  return NextResponse.json({ ok: result.status === 200 }, { status: result.status });
}
