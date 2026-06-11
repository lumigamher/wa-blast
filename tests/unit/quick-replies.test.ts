import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { createQuickReply, deleteQuickReply, listQuickReplies } from "@/lib/inbox/quick-replies";

async function seed(db: any, id = "o1") {
  await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
}

describe("quick replies", () => {
  it("crear + listar por org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await createQuickReply(db, "o1", { shortcut: "saludo", body: "¡Hola! ¿En qué te ayudo?" });
    const rows = await listQuickReplies(db, "o1");
    expect(rows.length).toBe(1);
    expect(rows[0].shortcut).toBe("saludo");
  });

  it("aislamiento por org", async () => {
    const { db } = makeTestDb();
    await seed(db, "o1");
    await seed(db, "o2");
    await createQuickReply(db, "o1", { shortcut: "a", body: "A" });
    expect((await listQuickReplies(db, "o2")).length).toBe(0);
  });

  it("eliminar respeta org", async () => {
    const { db } = makeTestDb();
    await seed(db, "o1");
    await seed(db, "o2");
    const r = await createQuickReply(db, "o1", { shortcut: "x", body: "X" });
    await deleteQuickReply(db, "o2", r.id); // org equivocada → no borra
    expect((await listQuickReplies(db, "o1")).length).toBe(1);
    await deleteQuickReply(db, "o1", r.id);
    expect((await listQuickReplies(db, "o1")).length).toBe(0);
  });

  it("rechaza shortcut/body vacíos", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await expect(createQuickReply(db, "o1", { shortcut: "", body: "x" })).rejects.toThrow();
    await expect(createQuickReply(db, "o1", { shortcut: "a", body: "" })).rejects.toThrow();
  });
});
