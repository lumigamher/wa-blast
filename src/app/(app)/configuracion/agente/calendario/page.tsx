import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getCalendarConfig } from "@/lib/agent/integrations/calendar/config";
import { AgentCalendar } from "../_calendar";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const { orgId } = await requireOrg();

  const calendar = await getCalendarConfig(db, orgId);

  return (
    <AgentCalendar
      configured={!!calendar}
      current={{
        provider: calendar?.provider ?? "calcom",
        eventTypeId: calendar?.eventTypeId ?? 0,
        durationMin: calendar?.durationMin ?? 30,
        timezone: calendar?.timezone ?? "America/Bogota",
      }}
    />
  );
}
