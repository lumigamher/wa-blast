import { describe, expect, it } from "vitest";
import { isWindowOpen, windowExpiresAt, WINDOW_MS } from "@/lib/inbox/window";

describe("inbox window", () => {
  it("isWindowOpen with null lastIncomingAt returns false", () => {
    expect(isWindowOpen(null)).toBe(false);
  });

  it("isWindowOpen at 23h59 returns true", () => {
    const now = new Date();
    const lastIncomingAt = new Date(now.getTime() - 23 * 60 * 60 * 1000 - 59 * 60 * 1000);
    expect(isWindowOpen(lastIncomingAt, now)).toBe(true);
  });

  it("isWindowOpen at 24h+1s returns false", () => {
    const now = new Date();
    const lastIncomingAt = new Date(now.getTime() - WINDOW_MS - 1000);
    expect(isWindowOpen(lastIncomingAt, now)).toBe(false);
  });

  it("windowExpiresAt returns correct expiration time", () => {
    const lastIncomingAt = new Date("2026-06-11T12:00:00Z");
    const expires = windowExpiresAt(lastIncomingAt);
    expect(expires.getTime()).toBe(lastIncomingAt.getTime() + WINDOW_MS);
  });
});
