import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, paymentMethods } from "@/lib/db/schema";
import {
  addPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  setPaymentMethodEnabled,
} from "./methods";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({
    id: "o1",
    name: "o1",
    slug: "o1",
    createdAt: new Date(),
  });
}

describe("payment methods", () => {
  it("addPaymentMethod inserts", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addPaymentMethod(db, "o1", {
      type: "nequi",
      label: "Mi Nequi",
      details: "3001234567",
    });
    const rows = await db.select().from(paymentMethods);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("nequi");
    expect(rows[0].label).toBe("Mi Nequi");
    expect(rows[0].details).toBe("3001234567");
    expect(rows[0].enabled).toBe(true);
  });

  it("addPaymentMethod empty label throws", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await expect(
      addPaymentMethod(db, "o1", {
        type: "daviplata",
        label: "   ",
        details: "",
      }),
    ).rejects.toThrow("Etiqueta requerida");
  });

  it("listPaymentMethods returns all by default", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addPaymentMethod(db, "o1", {
      type: "nequi",
      label: "Nequi",
      details: "",
    });
    await addPaymentMethod(db, "o1", {
      type: "daviplata",
      label: "DaviPlata",
      details: "",
    });
    const rows = await listPaymentMethods(db, "o1");
    expect(rows).toHaveLength(2);
  });

  it("listPaymentMethods onlyEnabled filters disabled", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addPaymentMethod(db, "o1", {
      type: "nequi",
      label: "Nequi",
      details: "",
    });
    const method = (await listPaymentMethods(db, "o1"))[0];
    await setPaymentMethodEnabled(db, "o1", method.id, false);
    const enabled = await listPaymentMethods(db, "o1", true);
    expect(enabled).toHaveLength(0);
    const all = await listPaymentMethods(db, "o1", false);
    expect(all).toHaveLength(1);
  });

  it("setPaymentMethodEnabled toggles enabled", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addPaymentMethod(db, "o1", {
      type: "transferencia",
      label: "Transferencia",
      details: "1234-5678-9",
    });
    const method = (await listPaymentMethods(db, "o1"))[0];
    expect(method.enabled).toBe(true);
    await setPaymentMethodEnabled(db, "o1", method.id, false);
    const updated = (await listPaymentMethods(db, "o1"))[0];
    expect(updated.enabled).toBe(false);
    await setPaymentMethodEnabled(db, "o1", method.id, true);
    const reEnabled = (await listPaymentMethods(db, "o1"))[0];
    expect(reEnabled.enabled).toBe(true);
  });

  it("deletePaymentMethod removes", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await addPaymentMethod(db, "o1", {
      type: "link",
      label: "Link de pago",
      details: "url",
    });
    const method = (await listPaymentMethods(db, "o1"))[0];
    await deletePaymentMethod(db, "o1", method.id);
    const rows = await listPaymentMethods(db, "o1");
    expect(rows).toHaveLength(0);
  });

  it("deletePaymentMethod scoped to org", async () => {
    const { db } = makeTestDb();
    await seed(db);
    await db.insert(organization).values({
      id: "o2",
      name: "o2",
      slug: "o2",
      createdAt: new Date(),
    });
    await addPaymentMethod(db, "o1", {
      type: "nequi",
      label: "Nequi O1",
      details: "",
    });
    await addPaymentMethod(db, "o2", {
      type: "nequi",
      label: "Nequi O2",
      details: "",
    });
    const o1Methods = await listPaymentMethods(db, "o1");
    const o1Method = o1Methods[0];
    await deletePaymentMethod(db, "o1", o1Method.id);
    const o1After = await listPaymentMethods(db, "o1");
    const o2After = await listPaymentMethods(db, "o2");
    expect(o1After).toHaveLength(0);
    expect(o2After).toHaveLength(1);
  });
});
