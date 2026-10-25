import { describe, expect, it, vi } from "vitest";

// La base "revienta" en cualquier consulta de campañas.
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => {
      throw new Error("db caída");
    },
    update: () => {
      throw new Error("db caída");
    },
    transaction: () => {
      throw new Error("db caída");
    },
  },
}));
const sweep = vi.fn(async () => 2);
vi.mock("@/lib/agent/queue", () => ({ sweepAgentJobs: (...a: unknown[]) => sweep(...(a as [])) }));
vi.mock("@/lib/campaigns/worker", () => ({ getWorker: () => ({ runCampaign: async () => {} }) }));

describe("GET /api/cron/run-scheduled", () => {
  it("si las campañas lanzan, el barrido del agente corre igual y responde 200", async () => {
    process.env.CRON_SECRET = "s3cret";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/cron/run-scheduled/route");
    const res = await GET(new Request("http://x/api/cron/run-scheduled?secret=s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, triggered: [], recovered: [], agentJobs: 2 });
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith("[cron] campaigns error", expect.any(Error));
    errSpy.mockRestore();
  });
});
