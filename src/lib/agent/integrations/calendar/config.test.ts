import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getCalendarConfig, saveCalendarConfig } from "./config";

describe("calendar config", () => {
  it("guarda cifrado y relee", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveCalendarConfig(db, "o1", { provider: "calcom", apiKey: "secreta", eventTypeId: 42, durationMin: 30, timezone: "America/Bogota" });
    const cfg = await getCalendarConfig(db, "o1");
    expect(cfg?.apiKey).toBe("secreta");
    expect(cfg?.eventTypeId).toBe(42);
    expect(cfg?.timezone).toBe("America/Bogota");
    expect(cfg?.provider).toBe("calcom");
  });
  it("sin config → null", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    expect(await getCalendarConfig(db, "o2")).toBeNull();
  });
  it("la apiKey se guarda cifrada (no en claro en credentialsEnc)", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o3", name: "o3", slug: "o3", createdAt: new Date() });
    await saveCalendarConfig(db, "o3", { provider: "calcom", apiKey: "TOPSECRET", eventTypeId: 1, durationMin: 30, timezone: "UTC" });
    const { agentCalendar } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(agentCalendar).where(eq(agentCalendar.orgId, "o3"));
    expect(row.credentialsEnc).not.toContain("TOPSECRET");
  });
});
