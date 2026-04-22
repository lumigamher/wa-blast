import { and, or, eq, ne, inArray, like, sql, isNotNull, type SQLWrapper } from "drizzle-orm";
import { contacts, contactTags, tags } from "@/lib/db/schema";
import type { Condition, SegmentRule } from "./ast";

function compileCondition(c: Condition): SQLWrapper {
  if (c.field === "tag") {
    const values = Array.isArray(c.value) ? c.value : [c.value];
    const subquery = sql`
      ${contacts.id} IN (
        SELECT ${contactTags.contactId}
        FROM ${contactTags}
        INNER JOIN ${tags} ON ${tags.id} = ${contactTags.tagId}
        WHERE ${tags.name} IN (${sql.join(values.map((v) => sql`${String(v)}`), sql`, `)})
      )
    `;
    return subquery;
  }

  if (c.field.startsWith("custom.")) {
    const key = c.field.slice("custom.".length);
    const jsonPath = sql`json_extract(${contacts.customFields}, ${"$." + key})`;
    switch (c.op) {
      case "eq":
        return eq(jsonPath, String(c.value));
      case "neq":
        return ne(jsonPath, String(c.value));
      case "in": {
        const arr = Array.isArray(c.value) ? c.value : [c.value];
        return inArray(jsonPath, arr.map(String));
      }
      case "contains":
        return like(jsonPath, `%${String(c.value)}%`);
      case "exists":
        return isNotNull(jsonPath);
    }
  }

  const col = c.field === "email" ? contacts.email : c.field === "name" ? contacts.name : null;
  if (!col) throw new Error(`Unknown segment field: ${c.field}`);

  switch (c.op) {
    case "eq":
      return eq(col, String(c.value));
    case "neq":
      return ne(col, String(c.value));
    case "in": {
      const arr = Array.isArray(c.value) ? c.value : [c.value];
      return inArray(col, arr.map(String));
    }
    case "contains":
      return like(col, `%${String(c.value)}%`);
    case "exists":
      return isNotNull(col);
  }
}

export function compileRule(rule: SegmentRule): SQLWrapper {
  const parts = rule.conditions.map((c) =>
    "combinator" in c ? compileRule(c) : compileCondition(c),
  );
  if (parts.length === 1) return parts[0];
  return rule.combinator === "AND" ? and(...parts)! : or(...parts)!;
}
