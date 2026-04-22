import { z } from "zod";

export const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "in", "contains", "exists"]),
  value: z.unknown(),
});

export type Condition = z.infer<typeof conditionSchema>;

export type SegmentRule = {
  combinator: "AND" | "OR";
  conditions: (Condition | SegmentRule)[];
};

export const segmentRuleSchema: z.ZodType<SegmentRule> = z.lazy(() =>
  z.object({
    combinator: z.enum(["AND", "OR"]),
    conditions: z.array(z.union([conditionSchema, segmentRuleSchema])).min(1),
  }),
);
