import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { agentTools, organization } from "@/lib/db/schema";
import { setAgentTool, updateAgentConfig, saveCalendar, saveCatalog, addProduct, deleteProduct, listProducts, countProducts, setProductAvailable, setProductsAvailable, upsertProductBySku } from "./admin";
import { getAgentConfig } from "./config";
import { getCalendarConfig } from "./integrations/calendar/config";
import { getCatalogConfig } from "./integrations/catalog/config";

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
  it("saveCatalog guarda config válida", async () => {
    const { db } = makeTestDb();
    await org(db);
    await saveCatalog(db, "o1", {
      provider: "internal",
      credentials: {},
      config: {},
    });
    const cfg = await getCatalogConfig(db, "o1");
    expect(cfg).not.toBeNull();
    expect(cfg?.provider).toBe("internal");
  });
  it("saveCatalog reutiliza credenciales si están vacías", async () => {
    const { db } = makeTestDb();
    await org(db);
    await saveCatalog(db, "o1", {
      provider: "http",
      credentials: { apiKey: "secret-123" },
      config: { url: "https://api.example.com" },
    });
    await saveCatalog(db, "o1", {
      provider: "http",
      credentials: {},
      config: { url: "https://api2.example.com" },
    });
    const cfg = await getCatalogConfig(db, "o1");
    expect(cfg?.credentials.apiKey).toBe("secret-123");
    expect(cfg?.config.url).toBe("https://api2.example.com");
  });
  it("saveCatalog rechaza provider inválido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(
      saveCatalog(db, "o1", {
        provider: "invalid" as never,
        credentials: {},
        config: {},
      })
    ).rejects.toThrow("Provider inválido");
  });
  it("addProduct crea un producto válido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await addProduct(db, "o1", { name: "iPhone 15", priceCop: 4500000, description: "Nuevo smartphone", sku: "IP15" });
    const prods = await listProducts(db, "o1");
    expect(prods).toHaveLength(1);
    expect(prods[0].name).toBe("iPhone 15");
    expect(prods[0].priceCop).toBe(4500000);
    expect(prods[0].sku).toBe("IP15");
    expect(prods[0].available).toBe(true);
  });
  it("addProduct rechaza nombre vacío", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(addProduct(db, "o1", { name: "  ", priceCop: 1000 })).rejects.toThrow("Nombre requerido");
  });
  it("addProduct rechaza precio negativo", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(addProduct(db, "o1", { name: "Producto", priceCop: -100 })).rejects.toThrow("Precio inválido");
  });
  it("addProduct rechaza precio inválido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(addProduct(db, "o1", { name: "Producto", priceCop: NaN })).rejects.toThrow("Precio inválido");
  });
  it("deleteProduct elimina producto solo dentro de la org", async () => {
    const { db } = makeTestDb();
    await org(db);
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addProduct(db, "o1", { name: "Prod1", priceCop: 1000 });
    await addProduct(db, "o2", { name: "Prod2", priceCop: 2000 });
    const prods1 = await listProducts(db, "o1");
    const prodId = prods1[0].id;
    await deleteProduct(db, "o1", prodId);
    const remaining1 = await listProducts(db, "o1");
    const remaining2 = await listProducts(db, "o2");
    expect(remaining1).toHaveLength(0);
    expect(remaining2).toHaveLength(1);
  });
  it("filtra por nombre o sku y pagina", async () => {
    const { db } = makeTestDb();
    await org(db);
    for (const [name, sku] of [["Camisa Azul", "CA1"], ["Camisa Roja", "CR1"], ["Pantalón", "PA1"]] as const) {
      await addProduct(db, "o1", { name, priceCop: 1000, sku });
    }
    expect((await listProducts(db, "o1")).length).toBe(3);
    expect((await listProducts(db, "o1", { search: "camisa" })).map((p) => p.name).sort()).toEqual(["Camisa Azul", "Camisa Roja"]);
    expect((await listProducts(db, "o1", { search: "pa1" })).map((p) => p.name)).toEqual(["Pantalón"]);
    expect((await listProducts(db, "o1", { limit: 2, offset: 0 })).length).toBe(2);
    expect(await countProducts(db, "o1")).toBe(3);
    expect(await countProducts(db, "o1", { search: "camisa" })).toBe(2);
  });
  it("toggle individual y masivo, scoped por org", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(organization).values({ id: "o2", name: "o2", slug: "o2", createdAt: new Date() });
    await addProduct(db, "o1", { name: "A", priceCop: 1, sku: "A" });
    await addProduct(db, "o1", { name: "B", priceCop: 1, sku: "B" });
    const [a, b] = await listProducts(db, "o1");
    await setProductAvailable(db, "o1", a.id, false);
    expect((await listProducts(db, "o1")).find((p) => p.id === a.id)?.available).toBe(false);
    await setProductsAvailable(db, "o1", [a.id, b.id], true);
    expect((await listProducts(db, "o1")).every((p) => p.available)).toBe(true);
    await setProductAvailable(db, "o2", a.id, false);
    expect((await listProducts(db, "o1")).find((p) => p.id === a.id)?.available).toBe(true);
  });
  it("crea si el sku no existe, actualiza si existe; sin sku crea siempre", async () => {
    const { db } = makeTestDb();
    await org(db);
    const a = await upsertProductBySku(db, "o1", { name: "Camisa", priceCop: 1000, sku: "C1" });
    expect(a.action).toBe("created");
    const b = await upsertProductBySku(db, "o1", { name: "Camisa XL", priceCop: 1500, sku: "C1" });
    expect(b.action).toBe("updated");
    expect(b.id).toBe(a.id);
    const list = await listProducts(db, "o1");
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Camisa XL");
    expect(list[0].priceCop).toBe(1500);
    await upsertProductBySku(db, "o1", { name: "Sin SKU", priceCop: 1 });
    await upsertProductBySku(db, "o1", { name: "Sin SKU 2", priceCop: 1 });
    expect((await listProducts(db, "o1")).length).toBe(3);
  });
  it("rechaza nombre vacío o precio inválido", async () => {
    const { db } = makeTestDb();
    await org(db);
    await expect(upsertProductBySku(db, "o1", { name: " ", priceCop: 1 })).rejects.toThrow(/nombre/i);
    await expect(upsertProductBySku(db, "o1", { name: "X", priceCop: -5 })).rejects.toThrow(/precio/i);
  });
});
