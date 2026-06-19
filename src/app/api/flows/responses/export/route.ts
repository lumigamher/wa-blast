import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { checkModuleGate } from "@/lib/billing/access";
import { db } from "@/lib/db/client";
import { flowResponsesToCsv, listFlowResponses } from "@/lib/flows/responses";

export async function GET(): Promise<NextResponse> {
  const { orgId } = await requireOrg();
  if (!(await checkModuleGate(db, orgId, "flows")))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await listFlowResponses(db, orgId);
  const csv = `${flowResponsesToCsv(rows)}\n`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="respuestas-formularios.csv"',
    },
  });
}
