import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getShippingConfig, saveShippingConfig } from "./config";

describe("shipping config", () => {
  it("guarda y lee config con credenciales cifradas", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveShippingConfig(db, "o1", {
      provider: "mipaquete",
      credentials: { apiKey: "secreto-123" },
      config: { originCityName: "Medellín", volumetricFactor: 2500 },
    });
    const cfg = await getShippingConfig(db, "o1");
    expect(cfg?.provider).toBe("mipaquete");
    expect(cfg?.credentials.apiKey).toBe("secreto-123");
    expect(cfg?.config.originCityName).toBe("Medellín");
  });

  it("org sin config → null", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    expect(await getShippingConfig(db, "o1")).toBeNull();
  });
});
