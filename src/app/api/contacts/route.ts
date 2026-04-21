import { NextResponse } from "next/server";
import { chatwootApi } from "@/lib/chatwoot";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const q = url.searchParams.get("q") ?? undefined;

  try {
    const res = await chatwootApi.listContacts(session.user.chatwootToken, {
      page,
      q: q || undefined,
    });
    return NextResponse.json(res, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
