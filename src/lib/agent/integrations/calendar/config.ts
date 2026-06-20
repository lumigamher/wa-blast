import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";
import type { DB } from "@/lib/db/client";
import { agentCalendar } from "@/lib/db/schema";

export type CalendarConfig = {
  provider: "calcom" | "calendly" | "google";
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
  timezone: string;
};

export async function saveCalendarConfig(db: DB, orgId: string, input: CalendarConfig): Promise<void> {
  const now = new Date();
  const credentialsEnc = encrypt(JSON.stringify({ apiKey: input.apiKey }));
  const configJson = JSON.stringify({ eventTypeId: input.eventTypeId, durationMin: input.durationMin, timezone: input.timezone });
  await db
    .insert(agentCalendar)
    .values({ orgId, provider: input.provider, credentialsEnc, configJson, updatedAt: now })
    .onConflictDoUpdate({ target: agentCalendar.orgId, set: { provider: input.provider, credentialsEnc, configJson, updatedAt: now } });
}

export async function getCalendarConfig(db: DB, orgId: string): Promise<CalendarConfig | null> {
  const row = (await db.select().from(agentCalendar).where(eq(agentCalendar.orgId, orgId)))[0];
  if (!row || !row.credentialsEnc) return null;
  let apiKey = "";
  try {
    apiKey = (JSON.parse(decrypt(row.credentialsEnc)) as { apiKey?: string }).apiKey ?? "";
  } catch {
    return null;
  }
  if (!apiKey) return null;
  const cfg = JSON.parse(row.configJson) as { eventTypeId?: number; durationMin?: number; timezone?: string };
  return {
    provider: row.provider,
    apiKey,
    eventTypeId: cfg.eventTypeId ?? 0,
    durationMin: cfg.durationMin ?? 30,
    timezone: cfg.timezone ?? "America/Bogota",
  };
}
