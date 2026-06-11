import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { applyCharge } from "@/lib/billing/subscription";
import { checkSubscriptionGate, SUB_REQUIRED_MSG } from "@/lib/billing/gate";

describe("checkSubscriptionGate", () => {
  it("sin suscripción → bloqueado con mensaje CTA", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    const r = await checkSubscriptionGate(db, "o1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe(SUB_REQUIRED_MSG);
  });

  it("con suscripción activa → pasa", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await applyCharge(db, { orgId: "o2", chargeId: "c", source: "manual" });
    expect((await checkSubscriptionGate(db, "o2")).ok).toBe(true);
  });
});
