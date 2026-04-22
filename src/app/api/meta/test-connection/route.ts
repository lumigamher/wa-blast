import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { credsFromSettings, getPhoneHealth } from "@/lib/meta/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);

  if (!creds) {
    return NextResponse.json({ ok: false, error: "Faltan credenciales" }, { status: 400 });
  }

  try {
    const health = await getPhoneHealth(creds);
    return NextResponse.json({
      ok: true,
      phone: health.display_phone_number,
      name: health.verified_name,
      quality: health.quality_rating,
      tier: health.messaging_limit_tier,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 400 },
    );
  }
}
