import { describe, expect, test } from "vitest";
import { normalizePhone } from "@/lib/contacts/phone";

describe("normalizePhone", () => {
  test("Colombian 10-digit mobile → +57", () => {
    expect(normalizePhone("3001234567", "CO")).toBe("+573001234567");
  });
  test("already E.164", () => {
    expect(normalizePhone("+573001234567", "CO")).toBe("+573001234567");
  });
  test("whitespace and dashes", () => {
    expect(normalizePhone(" 300-123-4567 ", "CO")).toBe("+573001234567");
  });
  test("invalid returns null", () => {
    expect(normalizePhone("abc", "CO")).toBeNull();
  });
});
