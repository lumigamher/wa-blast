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

  it("guardar con credenciales vacías CONSERVA la API key existente", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveShippingConfig(db, "o1", {
      provider: "mipaquete",
      credentials: { apiKey: "secreto-123" },
      config: { volumetricFactor: 2500 },
    });
    // El usuario edita el factor sin re-pegar la key (credenciales vacías).
    await saveShippingConfig(db, "o1", {
      provider: "mipaquete",
      credentials: {},
      config: { volumetricFactor: 4000 },
    });
    const cfg = await getShippingConfig(db, "o1");
    expect(cfg?.credentials.apiKey).toBe("secreto-123"); // se conserva
    expect(cfg?.config.volumetricFactor).toBe(4000); // se actualiza
  });

  it("org sin config → null", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    expect(await getShippingConfig(db, "o1")).toBeNull();
  });
});
