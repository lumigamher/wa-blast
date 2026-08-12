import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getGatewayConfig, saveGatewayConfig } from "./config";

describe("gateway config", () => {
  it("guarda y descifra ambas keys + provider/model", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "anthropic",
      chatModel: "claude-haiku-4-5-20251001",
      openaiKey: "sk-openai",
      anthropicKey: "sk-anthropic",
    });
    const cfg = await getGatewayConfig(db, "o1");
    expect(cfg).toMatchObject({
      chatProvider: "anthropic",
      chatModel: "claude-haiku-4-5-20251001",
      openaiKey: "sk-openai",
      anthropicKey: "sk-anthropic",
    });
  });
  it("conserva la key existente si el patch la trae vacía/ausente", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", { openaiKey: "sk-keep" });
    await saveGatewayConfig(db, "o1", { chatModel: "gpt-5-mini", openaiKey: "" });
    const cfg = await getGatewayConfig(db, "o1");
    expect(cfg?.openaiKey).toBe("sk-keep");
    expect(cfg?.chatModel).toBe("gpt-5-mini");
  });
  it("getGatewayConfig devuelve null si no hay fila", async () => {
    const { db } = makeTestDb();
    expect(await getGatewayConfig(db, "nope")).toBeNull();
  });
  it("guarda y descifra la key de OpenRouter con su provider/modelo", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "openrouter",
      chatModel: "nvidia/nemotron-3.5-lightning:free",
      openrouterKey: "sk-or-v1-abc",
    });
    const cfg = await getGatewayConfig(db, "o1");
    expect(cfg).toMatchObject({
      chatProvider: "openrouter",
      chatModel: "nvidia/nemotron-3.5-lightning:free",
      openrouterKey: "sk-or-v1-abc",
    });
  });
  it("guarda el modelo de respaldo y lo limpia con cadena vacía", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "openrouter",
      chatModel: "nvidia/nemotron-3.5-lightning:free",
      fallbackModel: "nvidia/nemotron-3.5-lightning",
    });
    expect((await getGatewayConfig(db, "o1"))?.fallbackModel).toBe("nvidia/nemotron-3.5-lightning");
    await saveGatewayConfig(db, "o1", { fallbackModel: "" });
    expect((await getGatewayConfig(db, "o1"))?.fallbackModel).toBeNull();
  });
  it("conserva la key de OpenRouter si el patch la trae vacía", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", { openrouterKey: "sk-or-keep" });
    await saveGatewayConfig(db, "o1", { chatProvider: "openrouter", openrouterKey: "" });
    expect((await getGatewayConfig(db, "o1"))?.openrouterKey).toBe("sk-or-keep");
  });
});
