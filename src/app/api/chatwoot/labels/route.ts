import { NextResponse } from "next/server";
import { chatwootApi } from "@/lib/chatwoot";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const res = await chatwootApi.listLabels(session.user.chatwootToken);
    return NextResponse.json(
      { labels: res.payload ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
