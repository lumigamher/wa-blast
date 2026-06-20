import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentTools, organization } from "@/lib/db/schema";
import { setAgentTool, updateAgentConfig, saveCalendar } from "./admin";
import { getAgentConfig } from "./config";
import { getCalendarConfig } from "./integrations/calendar/config";

async function org(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
}

describe("agent admin helpers", () => {
  it("updateAgentConfig valida y guarda campos básicos", async () => {
    const { db } = makeTestDb();
    await org(db);
    await updateAgentConfig(db, "o1", { enabled: true, name: "Lula", systemPrompt: "vende", provider: "anthropic", model: "claude-haiku-4-5-20251001", temperature: 0.3, fallbackMessage: "espera", monthlyCostCapCop: 50000 });
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.enabled).toBe(true);
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.temperature).toBe(0.3);
  });
  it("acota temperatura a [0,1] y rechaza provider inválido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await updateAgentConfig(db, "o1", { temperature: 5, provider: "x" as never });
    const cfg = await getAgentConfig(db, "o1");
    expect(cfg.temperature).toBeLessThanOrEqual(1);
    expect(cfg.provider).toBe("openai");
  });
  it("setAgentTool activa/crea y desactiva un built-in", async () => {
    const { db } = makeTestDb();
    await org(db);
    await setAgentTool(db, "o1", "calcular_total", true);
    let rows = await db.select().from(agentTools).where(eq(agentTools.orgId, "o1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    await setAgentTool(db, "o1", "calcular_total", false);
    rows = await db.select().from(agentTools).where(eq(agentTools.orgId, "o1"));
    expect(rows[0].enabled).toBe(false);
  });
  it("setAgentTool rechaza built-in desconocida", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(setAgentTool(db, "o1", "no_existe", true)).rejects.toThrow();
  });
  it("saveCalendar guarda config válida de cal.com", async () => {
    const { db } = makeTestDb();
    await org(db);
    await saveCalendar(db, "o1", {
      provider: "calcom",
      apiKey: "test-key-123",
      eventTypeId: 456,
      durationMin: 45,
      timezone: "America/Bogota",
    });
    const cfg = await getCalendarConfig(db, "o1");
    expect(cfg).not.toBeNull();
    expect(cfg?.provider).toBe("calcom");
    expect(cfg?.eventTypeId).toBe(456);
    expect(cfg?.durationMin).toBe(45);
    expect(cfg?.timezone).toBe("America/Bogota");
  });
  it("saveCalendar rechaza provider no soportado", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(
      saveCalendar(db, "o1", {
        provider: "calendly" as never,
        apiKey: "test-key",
        eventTypeId: 123,
        durationMin: 30,
        timezone: "UTC",
      })
    ).rejects.toThrow("Provider de calendario no soportado aún");
  });
  it("saveCalendar rechaza apiKey vacía", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(
      saveCalendar(db, "o1", {
        provider: "calcom",
        apiKey: "",
        eventTypeId: 123,
        durationMin: 30,
        timezone: "UTC",
      })
    ).rejects.toThrow("API key requerida");
  });
  it("saveCalendar rechaza eventTypeId inválido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(
      saveCalendar(db, "o1", {
        provider: "calcom",
        apiKey: "test-key",
        eventTypeId: 0,
        durationMin: 30,
        timezone: "UTC",
      })
    ).rejects.toThrow("eventTypeId inválido");
  });
});
