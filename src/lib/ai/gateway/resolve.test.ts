import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { saveGatewayConfig } from "./config";
import { makeOpenRouterClient, OPENROUTER_BASE_URL, resolveChatProvider, resolveEmbeddingProvider } from "./resolve";

describe("gateway resolve", () => {
  it("resolveChatProvider arma provider OpenAI con su key", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "openai",
      chatModel: "gpt-5-mini",
      openaiKey: "sk-x",
    });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.model).toBe("gpt-5-mini");
      expect(typeof r.provider.chat).toBe("function");
    }
  });
  it("resolveChatProvider falla legible si falta la key del proveedor elegido", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "anthropic",
      chatModel: "claude-haiku-4-5-20251001",
      openaiKey: "sk-x",
    });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Anthropic/i);
  });
  it("resolveChatProvider falla si no hay config", async () => {
    const { db } = makeTestDb();
    expect((await resolveChatProvider(db, "nope")).ok).toBe(false);
  });
  it("resolveEmbeddingProvider usa la key OpenAI aunque el chat sea Anthropic", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "anthropic",
      anthropicKey: "sk-a",
      openaiKey: "sk-o",
    });
    const emb = await resolveEmbeddingProvider(db, "o1");
    expect(emb).not.toBeNull();
    expect(emb?.model).toBe("text-embedding-3-small");
  });
  it("makeOpenRouterClient apunta al endpoint de OpenRouter", () => {
    const client = makeOpenRouterClient("sk-or-1");
    expect(client.baseURL).toBe(OPENROUTER_BASE_URL);
    expect(client.baseURL).toBe("https://openrouter.ai/api/v1");
  });

  it("resolveChatProvider arma provider OpenRouter con su key y modelo", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "openrouter",
      chatModel: "nvidia/nemotron-3.5-lightning:free",
      openrouterKey: "sk-or-1",
    });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.model).toBe("nvidia/nemotron-3.5-lightning:free");
      expect(typeof r.provider.chat).toBe("function");
    }
  });

  it("resolveChatProvider reporta el modelo de respaldo configurado", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "openrouter",
      chatModel: "nvidia/nemotron-3.5-lightning:free",
      openrouterKey: "sk-or-1",
      fallbackModel: "nvidia/nemotron-3.5-lightning",
    });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fallbackModel).toBe("nvidia/nemotron-3.5-lightning");
  });

  it("resolveChatProvider deja el respaldo en null si no se configuró", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", { chatProvider: "openai", chatModel: "gpt-5-mini", openaiKey: "sk-x" });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fallbackModel).toBeNull();
  });

  it("resolveChatProvider falla legible si falta la key de OpenRouter", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", {
      chatProvider: "openrouter",
      chatModel: "nvidia/nemotron-3.5-lightning:free",
      openaiKey: "sk-x",
    });
    const r = await resolveChatProvider(db, "o1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/OpenRouter/i);
  });

  it("resolveEmbeddingProvider null sin key OpenAI", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveGatewayConfig(db, "o1", { chatProvider: "anthropic", anthropicKey: "sk-a" });
    expect(await resolveEmbeddingProvider(db, "o1")).toBeNull();
  });
});
