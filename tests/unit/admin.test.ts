import { describe, expect, it } from "vitest";
import { isAdminEmail } from "@/lib/auth/admin";

describe("isAdminEmail", () => {
  it("matchea contra la lista, case-insensitive y con espacios", () => {
    const list = "luis@clonai.co, Otro@x.co";
    expect(isAdminEmail("luis@clonai.co", list)).toBe(true);
    expect(isAdminEmail("LUIS@CLONAI.CO", list)).toBe(true);
    expect(isAdminEmail("otro@x.co", list)).toBe(true);
    expect(isAdminEmail("nadie@x.co", list)).toBe(false);
    expect(isAdminEmail("luis@clonai.co", "")).toBe(false);
  });
});
