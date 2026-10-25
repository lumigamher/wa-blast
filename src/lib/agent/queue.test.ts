import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { agentJobs, conversations, organization } from "@/lib/db/schema";
import {
  __resetQueue,
  type AgentJob,
  claimAgentJob,
  enqueueAgentTurn,
  runAgentJob,
  sweepAgentJobs,
} from "./queue";

type TestDb = ReturnType<typeof makeTestDb>["db"];

async function seed(db: TestDb) {
  for (const o of ["o1", "o2"]) {
    await db.insert(organization).values({ id: o, name: o, slug: o, createdAt: new Date() });
  }
  await db.insert(conversations).values([
    { id: "c1", orgId: "o1", phone: "+57300", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() },
    { id: "c2", orgId: "o1", phone: "+57301", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() },
    { id: "c3", orgId: "o2", bsuid: "bsuid-9", lastMessageAt: new Date(), unreadCount: 0, createdAt: new Date() },
  ]);
}

function jobRow(db: TestDb, id: string) {
  return db.select().from(agentJobs).where(eq(agentJobs.conversationId, id)).get();
}

describe("cola durable del agente", () => {
  let db: TestDb;
  beforeEach(async () => {
    vi.useFakeTimers();
    __resetQueue();
    db = makeTestDb().db;
    await seed(db);
  });
  afterEach(() => {
    __resetQueue();
    vi.useRealTimers();
  });

  it("debounce: ráfaga de encolados corre un solo turno tras el silencio", async () => {
    const runTurn = vi.fn(async () => {});
    const job: AgentJob = { orgId: "o1", conversationId: "c1", recipient: "+57300" };
    enqueueAgentTurn(db, job, 2000, { runTurn });
    await vi.advanceTimersByTimeAsync(1000);
    enqueueAgentTurn(db, job, 2000, { runTurn });
    await vi.advanceTimersByTimeAsync(1500);
    expect(runTurn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(runTurn).toHaveBeenCalledWith(db, job);
    // Turno exitoso: el job se borra.
    expect(jobRow(db, "c1")).toBeUndefined();
  });

  it("persiste el job con recipient serializado y attempts en 0 en cada encolado", async () => {
    const recipient = { phone: null, bsuid: "bsuid-9" };
    enqueueAgentTurn(db, { orgId: "o2", conversationId: "c3", recipient }, 5000, { runTurn: async () => {} });
    await db.update(agentJobs).set({ attempts: 2 }).where(eq(agentJobs.conversationId, "c3"));
    enqueueAgentTurn(db, { orgId: "o2", conversationId: "c3", recipient }, 5000, { runTurn: async () => {} });
    const row = jobRow(db, "c3");
    expect(row?.orgId).toBe("o2");
    expect(JSON.parse(row!.recipientJson)).toEqual(recipient);
    expect(row?.attempts).toBe(0);
    expect(row?.dueAt.getTime()).toBe(Date.now() + 5000);
    expect(row?.lockedUntil).toBeNull();
  });

  it("claim: no reclama antes de dueAt ni con lock vigente", async () => {
    enqueueAgentTurn(db, { orgId: "o1", conversationId: "c1", recipient: "+57300" }, 1000, { runTurn: async () => {} });
    const t0 = Date.now();
    expect(await claimAgentJob(db, "c1", new Date(t0))).toBeNull();
    const claimed = await claimAgentJob(db, "c1", new Date(t0 + 1000));
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.lockedUntil?.getTime()).toBe(t0 + 1000 + 180_000);
    expect(await claimAgentJob(db, "c1", new Date(t0 + 2000))).toBeNull();
    // Lock vencido: se puede volver a reclamar.
    const again = await claimAgentJob(db, "c1", new Date(t0 + 1000 + 180_001));
    expect(again?.attempts).toBe(2);
  });

  it("lock: dos runAgentJob concurrentes corren un solo turno", async () => {
    let release!: () => void;
    const runTurn = vi.fn(() => new Promise<void>((r) => (release = r)));
    enqueueAgentTurn(db, { orgId: "o1", conversationId: "c1", recipient: "+57300" }, 0, { runTurn });
    __resetQueue(); // sin timer: solo los dos llamados manuales
    const a = runAgentJob(db, "c1", { runTurn });
    const b = runAgentJob(db, "c1", { runTurn });
    expect(await b).toBe(false);
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1));
    release();
    expect(await a).toBe(true);
    expect(runTurn).toHaveBeenCalledTimes(1);
  });

  it("mensaje nuevo durante el turno: corre un segundo turno después", async () => {
    let release!: () => void;
    const job: AgentJob = { orgId: "o1", conversationId: "c1", recipient: "+57300" };
    const runTurn = vi
      .fn<(d: TestDb, j: AgentJob) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockImplementation(async () => {});
    enqueueAgentTurn(db, job, 1000, { runTurn });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runTurn).toHaveBeenCalledTimes(1);
    // Llega otro mensaje mientras el primer turno corre.
    enqueueAgentTurn(db, job, 1000, { runTurn });
    await vi.advanceTimersByTimeAsync(1000);
    // El timer venció pero el lock lo frena: sigue un solo turno.
    expect(runTurn).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(jobRow(db, "c1")).toBeUndefined());
  });

  it("recuperación: job vencido sin timer lo corre sweepAgentJobs", async () => {
    const runTurn = vi.fn(async () => {});
    enqueueAgentTurn(db, { orgId: "o1", conversationId: "c1", recipient: "+57300" }, 1000, { runTurn });
    __resetQueue(); // simula un reinicio: se pierde el timer, queda la fila
    await vi.advanceTimersByTimeAsync(5000);
    expect(runTurn).not.toHaveBeenCalled();
    const n = await sweepAgentJobs(db, new Date(), { runTurn });
    expect(n).toBe(1);
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(jobRow(db, "c1")).toBeUndefined());
  });

  it("descarta el job tras 3 fallos", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const runTurn = vi.fn(async () => {
      throw new Error("boom");
    });
    enqueueAgentTurn(db, { orgId: "o1", conversationId: "c1", recipient: "+57300" }, 1000, { runTurn });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runTurn).toHaveBeenCalledTimes(1);
    // Primer fallo: lock liberado, queda para el cron.
    expect(jobRow(db, "c1")?.attempts).toBe(1);
    expect(jobRow(db, "c1")?.lockedUntil).toBeNull();
    await sweepAgentJobs(db, new Date(), { runTurn });
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(jobRow(db, "c1")?.lockedUntil).toBeNull());
    await sweepAgentJobs(db, new Date(), { runTurn });
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(jobRow(db, "c1")).toBeUndefined());
    expect(err).toHaveBeenCalledWith("[agent] job descartado tras 3 intentos", expect.anything(), expect.anything());
    expect(await sweepAgentJobs(db, new Date(), { runTurn })).toBe(0);
    err.mockRestore();
  });

  it("barrido: cada turno corre con el orgId y recipient de su job, y no toca lo no vencido", async () => {
    const runTurn = vi.fn(async () => {});
    enqueueAgentTurn(db, { orgId: "o1", conversationId: "c1", recipient: "+57300" }, 1000, { runTurn });
    enqueueAgentTurn(db, { orgId: "o2", conversationId: "c3", recipient: { phone: null, bsuid: "bsuid-9" } }, 1000, { runTurn });
    enqueueAgentTurn(db, { orgId: "o1", conversationId: "c2", recipient: "+57301" }, 60_000, { runTurn });
    __resetQueue();
    vi.setSystemTime(Date.now() + 2000);
    const n = await sweepAgentJobs(db, new Date(), { runTurn });
    expect(n).toBe(2);
    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(2));
    expect(runTurn).toHaveBeenCalledWith(db, { orgId: "o1", conversationId: "c1", recipient: "+57300" });
    expect(runTurn).toHaveBeenCalledWith(db, {
      orgId: "o2",
      conversationId: "c3",
      recipient: { phone: null, bsuid: "bsuid-9" },
    });
    expect(jobRow(db, "c2")).toBeDefined();
  });
});
