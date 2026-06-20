import { describe, expect, it } from "vitest";
import { getCalendarProvider } from "./index";

describe("getCalendarProvider", () => {
  it("calcom → provider con getSlots/createBooking", () => {
    const p = getCalendarProvider({ provider: "calcom", apiKey: "k", eventTypeId: 1, durationMin: 30 });
    expect(typeof p.getSlots).toBe("function");
    expect(typeof p.createBooking).toBe("function");
  });
  it("provider no soportado → throw", () => {
    expect(() => getCalendarProvider({ provider: "google", apiKey: "k", eventTypeId: 1, durationMin: 30 })).toThrow();
  });
});
