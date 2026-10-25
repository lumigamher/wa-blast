import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { agentJobs } from "@/lib/db/schema";
import type { Recipient } from "@/lib/meta/recipient";
import { runRealTurn } from "./real-turn";

/** Lo que hace falta para correr un turno; se reconstruye solo desde la fila. */
export type AgentJob = {
  orgId: string;
  conversationId: string;
  recipient: string | Recipient;
};

export type TurnRunner = (db: DB, job: AgentJob) => Promise<void>;

/** Costura para tests: inyectar el turno evita llamar al LLM. */
export type QueueDeps = { runTurn?: TurnRunner };

type AgentJobRow = typeof agentJobs.$inferSelect;

/** Duración del lock de un turno en curso. */
export const AGENT_LOCK_MS = 180_000;
/** Intentos fallidos antes de descartar el job. */
export const AGENT_MAX_ATTEMPTS = 3;
/** Jobs por barrido del cron. */
const SWEEP_LIMIT = 20;

// Timers en memoria: solo latencia. La verdad está en `agent_jobs`.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleTimer(db: DB, conversationId: string, delayMs: number, deps?: QueueDeps): void {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    timers.delete(conversationId);
    void runAgentJob(db, conversationId, deps).catch((e) => console.error("[agent] job error", conversationId, e));
  }, delayMs);
  t.unref?.();
  timers.set(conversationId, t);
}

/**
 * Debounce por conversación: cada mensaje corre `dueAt` a `now + delayMs` y
 * reinicia los intentos. Si hay un turno en curso, su lock se respeta; al
 * terminar ve que `dueAt` cambió y vuelve a programar el turno.
 */
export function enqueueAgentTurn(db: DB, job: AgentJob, delayMs: number, deps?: QueueDeps): void {
  const now = Date.now();
  const values = {
    orgId: job.orgId,
    recipientJson: JSON.stringify(job.recipient),
    dueAt: new Date(now + delayMs),
    attempts: 0,
    updatedAt: new Date(now),
  };
  db.insert(agentJobs)
    .values({ conversationId: job.conversationId, ...values })
    .onConflictDoUpdate({ target: agentJobs.conversationId, set: values })
    .run();
  scheduleTimer(db, job.conversationId, delayMs, deps);
}

/**
 * Reclama el job si ya venció y nadie tiene el lock. Es un solo UPDATE
 * atómico, así que dos llamadores (o dos procesos) nunca reclaman a la vez.
 */
export function claimAgentJob(db: DB, conversationId: string, now: Date): AgentJobRow | null {
  const row = db
    .update(agentJobs)
    .set({
      lockedUntil: new Date(now.getTime() + AGENT_LOCK_MS),
      attempts: sql`${agentJobs.attempts} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentJobs.conversationId, conversationId),
        lte(agentJobs.dueAt, now),
        or(isNull(agentJobs.lockedUntil), lt(agentJobs.lockedUntil, now)),
      ),
    )
    .returning()
    .get();
  return row ?? null;
}

/**
 * Libera el job tras el turno. Si `dueAt` sigue igual al reclamado, el turno
 * cubrió todo y se borra (o se descarta tras agotar intentos). Si cambió, llegó
 * un mensaje mientras corría: se suelta el lock y se programa otro turno.
 */
function finishAgentJob(db: DB, claimed: AgentJobRow, error: unknown, deps?: QueueDeps): void {
  const { conversationId, orgId } = claimed;
  const failed = error !== undefined;
  if (!failed || claimed.attempts >= AGENT_MAX_ATTEMPTS) {
    const deleted = db
      .delete(agentJobs)
      .where(
        and(
          eq(agentJobs.conversationId, conversationId),
          eq(agentJobs.orgId, orgId),
          eq(agentJobs.dueAt, claimed.dueAt),
        ),
      )
      .returning({ id: agentJobs.conversationId })
      .all();
    if (deleted.length > 0) {
      if (failed) console.error("[agent] job descartado tras 3 intentos", conversationId, error);
      return;
    }
  }
  // Sigue la fila: falló con intentos restantes (el cron reintenta) o hay
  // mensaje nuevo (se reprograma ya).
  const row = db
    .update(agentJobs)
    .set({ lockedUntil: null, updatedAt: new Date() })
    .where(and(eq(agentJobs.conversationId, conversationId), eq(agentJobs.orgId, orgId)))
    .returning()
    .get();
  if (row && row.dueAt.getTime() !== claimed.dueAt.getTime()) {
    scheduleTimer(db, conversationId, Math.max(0, row.dueAt.getTime() - Date.now()), deps);
  }
}

/** Reclamo → turno → liberación. Devuelve false si no le tocaba correr. */
export async function runAgentJob(db: DB, conversationId: string, deps?: QueueDeps): Promise<boolean> {
  const now = new Date();
  const claimed = claimAgentJob(db, conversationId, now);
  if (!claimed) {
    // Si el timer se adelantó al `dueAt` (o el debounce se corrió), reprogramar.
    const row = db.select().from(agentJobs).where(eq(agentJobs.conversationId, conversationId)).get();
    const unlocked = !row?.lockedUntil || row.lockedUntil < now;
    if (row && unlocked && row.dueAt > now && !timers.has(conversationId)) {
      scheduleTimer(db, conversationId, row.dueAt.getTime() - now.getTime(), deps);
    }
    return false;
  }

  const job: AgentJob = {
    orgId: claimed.orgId,
    conversationId,
    recipient: JSON.parse(claimed.recipientJson) as string | Recipient,
  };
  const runTurn = deps?.runTurn ?? runRealTurn;
  let error: unknown = undefined;
  try {
    await runTurn(db, job);
  } catch (e) {
    error = e ?? new Error("turno falló");
    console.error("[agent] turn error", conversationId, e);
  }
  finishAgentJob(db, claimed, error, deps);
  return true;
}

/**
 * Barrido del cron: corre los jobs vencidos sin lock vigente (p. ej. tras un
 * reinicio que se llevó los timers). No espera los turnos; devuelve cuántos
 * lanzó. Recorre todas las orgs a propósito: cada turno usa el `orgId` de su job.
 */
export async function sweepAgentJobs(db: DB, now: Date, deps?: QueueDeps): Promise<number> {
  const due = db
    .select({ conversationId: agentJobs.conversationId })
    .from(agentJobs)
    .where(and(lte(agentJobs.dueAt, now), or(isNull(agentJobs.lockedUntil), lt(agentJobs.lockedUntil, now))))
    .orderBy(asc(agentJobs.dueAt))
    .limit(SWEEP_LIMIT)
    .all();
  for (const { conversationId } of due) {
    void runAgentJob(db, conversationId, deps).catch((e) => console.error("[agent] job error", conversationId, e));
  }
  return due.length;
}

/** Solo para tests. */
export function __resetQueue(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
