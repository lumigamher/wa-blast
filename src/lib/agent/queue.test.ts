import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetQueue, enqueueAgentTurn } from "./queue";

describe("agent queue debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetQueue();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("agrupa ráfaga: ejecuta el runner una vez tras el silencio", async () => {
    const runner = vi.fn(async () => {});
    enqueueAgentTurn("c1", runner, 2000);
    enqueueAgentTurn("c1", runner, 2000);
    enqueueAgentTurn("c1", runner, 2000);
    expect(runner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("conversaciones distintas son independientes", async () => {
    const r1 = vi.fn(async () => {});
    const r2 = vi.fn(async () => {});
    enqueueAgentTurn("c1", r1, 1000);
    enqueueAgentTurn("c2", r2, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(r1).toHaveBeenCalledTimes(1);
    expect(r2).toHaveBeenCalledTimes(1);
  });
});
