import { describe, it, expect } from "vitest";
import { buildOrderSummaryText } from "./summary";

describe("buildOrderSummaryText", () => {
  it("should format a valid order with multiple items", () => {
    const order = {
      id: "abcd1234efgh",
      totalCop: 6500,
      itemsJson: JSON.stringify([
        { nombre: "Cerveza", cantidad: 2, subtotal: 5000 },
        { nombre: "Agua", cantidad: 1, subtotal: 1500 },
      ]),
    };

    const result = buildOrderSummaryText(order);

    expect(result).toContain("Cerveza");
    expect(result).toContain("2x");
    expect(result).toContain("Total: $6.500");
    expect(result).toContain("abcd1234");
  });

  it("should handle invalid itemsJson gracefully", () => {
    const order = {
      id: "xyz9876abc",
      totalCop: 1000,
      itemsJson: "oops",
    };

    const result = buildOrderSummaryText(order);

    expect(result).toContain("Total: $1.000");
    expect(result).not.toThrow;
  });
});
