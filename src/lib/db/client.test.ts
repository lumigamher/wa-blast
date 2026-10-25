import { afterEach, describe, expect, it, vi } from "vitest";

describe("db client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("abre la conexión con busy_timeout, synchronous NORMAL y foreign_keys", async () => {
    vi.stubEnv("DATABASE_URL", ":memory:");
    vi.resetModules();
    const { db } = await import("./client");
    const sqlite = db.$client;
    expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(sqlite.pragma("synchronous", { simple: true })).toBe(1); // NORMAL
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
