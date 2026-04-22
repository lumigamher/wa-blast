import { describe, expect, test } from "vitest";
import { parseContactsFile, validateRows } from "@/lib/contacts/import";

const csv = `phone,name,email,city
3001234567,Alice,a@b.com,Bogota
invalid,Bob,b@b.com,Medellin
3001234567,Duplicate,,
`;

describe("parseContactsFile", () => {
  test("parses CSV into rows + headers", async () => {
    const { headers, rows } = await parseContactsFile(new File([csv], "c.csv", { type: "text/csv" }));
    expect(headers).toEqual(["phone", "name", "email", "city"]);
    expect(rows).toHaveLength(3);
  });
});

describe("validateRows", () => {
  test("normalizes phones, flags invalid + duplicate", () => {
    const rows = [
      { phone: "3001234567", name: "Alice", email: "a@b.com", city: "Bogota" },
      { phone: "invalid", name: "Bob", email: "b@b.com", city: "Medellin" },
      { phone: "3001234567", name: "Duplicate", email: "", city: "" },
    ];
    const { valid, invalid, duplicateCount } = validateRows(rows, {
      phoneCol: "phone",
      nameCol: "name",
      emailCol: "email",
      customCols: ["city"],
      defaultCountry: "CO",
    });
    expect(valid).toHaveLength(1);
    expect(valid[0].phone).toBe("+573001234567");
    expect(valid[0].customFields).toEqual({ city: "Bogota" });
    expect(invalid).toHaveLength(1);
    expect(duplicateCount).toBe(1);
  });
});
