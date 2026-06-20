import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { saveCalendarConfig } from "../../integrations/calendar/config";
import { agendarCita } from "./agendar-cita";

describe("agendar_cita", () => {
  it("crea la reserva y devuelve bookingId", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveCalendarConfig(db, "o1", {
      provider: "calcom",
      apiKey: "k",
      eventTypeId: 1,
      durationMin: 30,
      timezone: "America/Bogota",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: { uid: "bk_1", start: "2026-07-01T15:00:00.000Z" },
        }),
        { status: 201 },
      ),
    );
    const r = await agendarCita.run(
      { slotISO: "2026-07-01T15:00:00.000Z", nombre: "Ana", email: "a@x.com" },
      { db, orgId: "o1", conversationId: "c1" },
    );
    expect(r).toEqual({ ok: true, data: { bookingId: "bk_1", startISO: "2026-07-01T15:00:00.000Z" } });
    fetchMock.mockRestore();
  });

  it("sin calendario → ok:false", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    const r = await agendarCita.run(
      { slotISO: "x", nombre: "A", email: "a@x.com" },
      { db, orgId: "o2", conversationId: "c1" },
    );
    expect(r.ok).toBe(false);
  });
});
