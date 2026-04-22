import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema";
import { compileRule } from "./compiler";
import type { SegmentRule } from "./ast";

export async function runSegment(db: DB, orgId: string, rule: SegmentRule) {
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.optOutAt), compileRule(rule)));
}

export async function countSegment(db: DB, orgId: string, rule: SegmentRule): Promise<number> {
  const rows = await runSegment(db, orgId, rule);
  return rows.length;
}
