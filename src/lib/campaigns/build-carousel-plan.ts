import type { ComponentPlan } from "./component-plan";
import type { ParsedCarousel } from "@/lib/meta/carousel";

export type VarMapping = Record<string, { kind: "field" | "literal"; value: string }>;
type Contact = Record<string, string>;

export function resolveVarMapping(vars: VarMapping, contact: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, m] of Object.entries(vars)) {
    out[key] = m.kind === "field" ? contact[m.value] ?? "" : m.value;
  }
  return out;
}

export function buildCarouselPlan(input: { parsed: ParsedCarousel; vars: VarMapping; cardMedia: Record<number, string> }): {
  plan: ComponentPlan;
  resolve: (contact: Contact) => Record<string, string>;
} {
  const { parsed, vars, cardMedia } = input;
  const plan: ComponentPlan = {
    kind: "carousel",
    bodyVarKeys: parsed.topBodyVarKeys,
    cards: parsed.cards.map((c, i) => ({
      headerFormat: c.headerFormat,
      headerLink: cardMedia[i] ?? "",
      bodyVarKeys: c.bodyVarKeys,
      buttons: c.buttons,
    })),
  };
  const resolve = (contact: Contact): Record<string, string> => resolveVarMapping(vars, contact);
  return { plan, resolve };
}
