import { describe, expect, it } from "vitest";
import { shouldAdvanceStatus } from "./status-rank";

describe("shouldAdvanceStatus", () => {
  it("avanza hacia un rango mayor", () => {
    expect(shouldAdvanceStatus("pending", "sent")).toBe(true);
    expect(shouldAdvanceStatus("sent", "delivered")).toBe(true);
    expect(shouldAdvanceStatus("delivered", "read")).toBe(true);
    expect(shouldAdvanceStatus("sent", "read")).toBe(true); // read sin delivered previo
  });
  it("no retrocede ni repite", () => {
    expect(shouldAdvanceStatus("read", "delivered")).toBe(false);
    expect(shouldAdvanceStatus("read", "sent")).toBe(false);
    expect(shouldAdvanceStatus("delivered", "delivered")).toBe(false);
    expect(shouldAdvanceStatus("delivered", "sent")).toBe(false);
  });
  it("failed solo desde pending o sent", () => {
    expect(shouldAdvanceStatus("pending", "failed")).toBe(true);
    expect(shouldAdvanceStatus("sent", "failed")).toBe(true);
    expect(shouldAdvanceStatus("delivered", "failed")).toBe(false);
    expect(shouldAdvanceStatus("read", "failed")).toBe(false);
  });
  it("failed es terminal", () => {
    expect(shouldAdvanceStatus("failed", "delivered")).toBe(false);
    expect(shouldAdvanceStatus("failed", "read")).toBe(false);
    expect(shouldAdvanceStatus("failed", "failed")).toBe(false);
  });
  it("sin estado actual, cualquiera avanza", () => {
    expect(shouldAdvanceStatus(null, "sent")).toBe(true);
    expect(shouldAdvanceStatus(undefined, "failed")).toBe(true);
  });
});
