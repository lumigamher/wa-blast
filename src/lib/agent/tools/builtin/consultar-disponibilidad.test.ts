import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { saveCalendarConfig } from "../../integrations/calendar/config";
import { consultarDisponibilidad } from "./consultar-disponibilidad";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await saveCalendarConfig(db, "o1", {
    provider: "calcom",
    apiKey: "k",
    eventTypeId: 1,
    durationMin: 30,
    timezone: "America/Bogota",
  });
}

describe("consultar_disponibilidad", () => {
  it("devuelve slots cuando hay calendario configurado", async () => {
    const { db } = makeTestDb();
    await seed(db);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: { "2026-07-01": [{ start: "2026-07-01T15:00:00.000Z" }] },
        }),
        { status: 200 },
      ),
    );
    const r = await consultarDisponibilidad.run(
      { fecha: "2026-07-01", dias: 1 },
      { db, orgId: "o1", conversationId: "c1" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { slots: { startISO: string }[] };
      expect(data.slots[0].startISO).toBe("2026-07-01T15:00:00.000Z");
    }
    fetchMock.mockRestore();
  });

  it("sin calendario configurado → ok:false", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    const r = await consultarDisponibilidad.run(
      { fecha: "2026-07-01" },
      { db, orgId: "o2", conversationId: "c1" },
    );
    expect(r.ok).toBe(false);
  });
});
