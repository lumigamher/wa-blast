import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { conversations, organization } from "@/lib/db/schema";
import { listConversations } from "./store";
import { createLabel, setConversationLabels } from "./labels";

async function seed(db: ReturnType<typeof makeTestDb>["db"], orgId = "o1") {
  await db
    .insert(organization)
    .values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() })
    .onConflictDoNothing();

  const c_ia = "c_ia";
  await db
    .insert(conversations)
    .values({
      id: c_ia,
      orgId,
      phone: "+573001",
      status: "open",
      unreadCount: 0,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      agentPaused: false,
    })
    .onConflictDoNothing();

  const c_hum = "c_hum";
  await db
    .insert(conversations)
    .values({
      id: c_hum,
      orgId,
      phone: "+573002",
      status: "open",
      unreadCount: 0,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      agentPaused: true,
    })
    .onConflictDoNothing();

  return { c_ia, c_hum };
}

describe("inbox store", () => {
  it("listConversations trae agentPaused y filtra por agent ia/humano", async () => {
    const { db } = makeTestDb();
    const { c_ia, c_hum } = await seed(db);

    const all = await listConversations(db, "o1", {});
    expect(all.length).toBe(2);
    expect(all.find((c) => c.id === c_ia)).toHaveProperty("agentPaused", false);
    expect(all.find((c) => c.id === c_hum)).toHaveProperty(
      "agentPaused",
      true
    );

    const ia = await listConversations(db, "o1", { agent: "ia" });
    expect(ia.map((c) => c.id)).toContain(c_ia);
    expect(ia.map((c) => c.id)).not.toContain(c_hum);

    const hum = await listConversations(db, "o1", { agent: "humano" });
    expect(hum.map((c) => c.id)).toContain(c_hum);
    expect(hum.map((c) => c.id)).not.toContain(c_ia);
  });

  it("listConversations filtra por labelId", async () => {
    const { db } = makeTestDb();
    const { c_ia, c_hum } = await seed(db);

    const labelId = await createLabel(db, "o1", { name: "Test", color: "#000" });
    await setConversationLabels(db, "o1", c_ia, [labelId]);

    const withLabel = await listConversations(db, "o1", { labelId });
    expect(withLabel.map((c) => c.id)).toContain(c_ia);
    expect(withLabel.map((c) => c.id)).not.toContain(c_hum);
  });
});
