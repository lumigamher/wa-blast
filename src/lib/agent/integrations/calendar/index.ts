import { makeCalcomProvider } from "./calcom";
import type { CalendarProvider } from "./types";

export type CalendarSettings = {
  provider: "calcom" | "calendly" | "google";
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
};

export function getCalendarProvider(s: CalendarSettings): CalendarProvider {
  switch (s.provider) {
    case "calcom":
      return makeCalcomProvider({ apiKey: s.apiKey, eventTypeId: s.eventTypeId, durationMin: s.durationMin });
    default:
      throw new Error(`Provider de calendario no soportado aún: ${s.provider}`);
  }
}
