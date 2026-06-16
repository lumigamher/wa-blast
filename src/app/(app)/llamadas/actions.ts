"use server";

import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getRingingCalls, type RingingCall } from "@/lib/calls/store";

export async function pollRingingCallsAction(): Promise<RingingCall[]> {
  const { orgId } = await requireOrg();
  return getRingingCalls(db, orgId);
}
