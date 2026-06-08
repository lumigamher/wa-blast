export type SendParam =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } };

export type SendComponent =
  | { type: "body"; parameters: SendParam[] }
  | { type: "header"; parameters: SendParam[] }
  | { type: "button"; sub_type: "url"; index: string; parameters: SendParam[] }
  | { type: "carousel"; cards: SendCard[] };

export type SendCard = { card_index: number; components: SendComponent[] };

export type CarouselCardPlan = {
  headerFormat: "IMAGE" | "VIDEO";
  headerLink: string;
  bodyVarKeys: string[];
  buttons: Array<{ type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER"; dynamicUrlSuffixKey?: string }>;
};

export type ComponentPlan =
  | { kind: "standard"; bodyVarKeys: string[] }
  | { kind: "carousel"; bodyVarKeys: string[]; cards: CarouselCardPlan[] };

function textParams(keys: string[], vars: Record<string, string>): SendParam[] {
  return keys.map((k) => ({ type: "text" as const, text: vars[k] ?? "" }));
}

export function buildSendComponents(plan: ComponentPlan, vars: Record<string, string>): SendComponent[] {
  if (plan.kind === "standard") {
    if (plan.bodyVarKeys.length === 0) return [];
    return [{ type: "body", parameters: textParams(plan.bodyVarKeys, vars) }];
  }
  // carousel handled in Task 1.2
  return [];
}
