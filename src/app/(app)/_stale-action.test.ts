import { describe, expect, it } from "vitest";
import { isStaleActionError } from "./_stale-action";

describe("isStaleActionError", () => {
  it("detecta el error de Server Action obsoleta", () => {
    expect(
      isStaleActionError(
        'Failed to find Server Action "abc". This request might be from an older or newer deployment.'
      )
    ).toBe(true);
    expect(isStaleActionError("older or newer deployment")).toBe(true);
  });

  it("no matchea errores normales", () => {
    expect(
      isStaleActionError("TypeError: x is not a function")
    ).toBe(false);
    expect(isStaleActionError("")).toBe(false);
  });
});
