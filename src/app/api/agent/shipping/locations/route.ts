import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { searchMipaqueteLocations } from "@/lib/agent/integrations/shipping/mipaquete";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { orgId } = await requireOrg();
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ cities: [] });
    }

    const cfg = await getShippingConfig(db, orgId);
    const apiKey = cfg?.credentials?.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Configura tu API key de Mipaquete primero" },
        { status: 400 },
      );
    }

    const cities = await searchMipaqueteLocations(apiKey, q);
    return NextResponse.json({ cities });
  } catch (error) {
    console.error("[shipping/locations] error:", error);
    return NextResponse.json(
      { error: "Error al buscar ciudades" },
      { status: 500 },
    );
  }
}
