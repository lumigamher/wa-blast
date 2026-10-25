import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { agentConfigs, conversations, messages, organization } from "@/lib/db/schema";

const markRead = vi.fn(async () => ({}));
const runAgentTurn = vi.fn(async () => {});
const setAgentTyping = vi.fn(async () => {});

vi.mock("@/lib/meta/client", () => ({
  markRead: (...a: unknown[]) => markRead(...(a as [])),
  sendText: async () => ({ wamid: "w" }),
}));
// Con credenciales, para que el typing por Meta se intente si no hay chequeo.
vi.mock("@/lib/meta/graph", () => ({ credsFromSettings: () => ({ token: "t", phoneNumberId: "p" }) }));
vi.mock("@/lib/org/settings", () => ({ getOrgSettings: async () => ({}) }));
vi.mock("./turn", () => ({ runAgentTurn: (...a: unknown[]) => runAgentTurn(...(a as [])) }));
vi.mock("./pause", async (orig) => ({
  ...(await orig<typeof import("./pause")>()),
  setAgentTyping: (...a: unknown[]) => setAgentTyping(...(a as [])),
}));

const { runRealTurn } = await import("./real-turn");

async function seed(enabled: boolean, paused: boolean) {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() });
  await db.insert(agentConfigs).values({ orgId: "o1", enabled, name: "B", systemPrompt: "", provider: "openai", model: "gpt-5-mini", temperature: 0, fallbackMessage: "x", maxStepsPerTurn: 5, advancedMode: false, updatedAt: new Date() });
  await db.insert(messages).values({ id: "m1", conversationId: "c1", orgId: "o1", direction: "in", wamid: "wamid-1", type: "text", body: "Hola", createdAt: new Date() });
  if (paused) await db.update(conversations).set({ agentPaused: true }).where(eq(conversations.id, "c1"));
  return db;
}

const job = { orgId: "o1", conversationId: "c1", recipient: "+57300" };

describe("runRealTurn", () => {
  beforeEach(() => {
    markRead.mockClear();
    runAgentTurn.mockClear();
    setAgentTyping.mockClear();
  });

  it("conversación pausada: ni typing ni turno", async () => {
    const db = await seed(true, true);
    await runRealTurn(db, job);
    expect(markRead).not.toHaveBeenCalled();
    expect(setAgentTyping).not.toHaveBeenCalled();
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("agente apagado: ni typing ni turno", async () => {
    const db = await seed(false, false);
    await runRealTurn(db, job);
    expect(markRead).not.toHaveBeenCalled();
    expect(setAgentTyping).not.toHaveBeenCalled();
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("agente activo: typing y turno", async () => {
    const db = await seed(true, false);
    await runRealTurn(db, job);
    expect(markRead).toHaveBeenCalledWith(expect.anything(), { wamid: "wamid-1", typing: true });
    expect(setAgentTyping).toHaveBeenCalled();
    expect(runAgentTurn).toHaveBeenCalledTimes(1);
  });
});
