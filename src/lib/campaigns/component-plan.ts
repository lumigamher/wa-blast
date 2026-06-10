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

export type FlowPlan = {
  kind: "flow";
  flowId: string;
  cta: string;
  bodyText: string;
};

export type ComponentPlan =
  | { kind: "standard"; bodyVarKeys: string[] }
  | { kind: "carousel"; bodyVarKeys: string[]; cards: CarouselCardPlan[] }
  | FlowPlan;

function textParams(keys: string[], vars: Record<string, string>): SendParam[] {
  return keys.map((k) => ({ type: "text" as const, text: vars[k] ?? "" }));
}

export function buildSendComponents(plan: ComponentPlan, vars: Record<string, string>): SendComponent[] {
  if (plan.kind === "standard") {
    if (plan.bodyVarKeys.length === 0) return [];
    return [{ type: "body", parameters: textParams(plan.bodyVarKeys, vars) }];
  }

  if (plan.kind === "carousel") {
    const components: SendComponent[] = [];
    if (plan.bodyVarKeys.length > 0) {
      components.push({ type: "body", parameters: textParams(plan.bodyVarKeys, vars) });
    }
    const cards: SendCard[] = plan.cards.map((card, ci) => {
      const comps: SendComponent[] = [];
      const fmt = card.headerFormat === "IMAGE" ? "image" : "video";
      comps.push({
        type: "header",
        parameters: [
          fmt === "image"
            ? { type: "image", image: { link: card.headerLink } }
            : { type: "video", video: { link: card.headerLink } },
        ],
      });
      if (card.bodyVarKeys.length > 0) {
        comps.push({ type: "body", parameters: textParams(card.bodyVarKeys, vars) });
      }
      card.buttons.forEach((btn, bi) => {
        if (btn.dynamicUrlSuffixKey) {
          comps.push({
            type: "button",
            sub_type: "url",
            index: String(bi),
            parameters: [{ type: "text", text: vars[btn.dynamicUrlSuffixKey] ?? "" }],
          });
        }
      });
      return { card_index: ci, components: comps };
    });
    components.push({ type: "carousel", cards });
    return components;
  }

  // Flow plan - not used for template sending, but guard for completeness
  return [];
}
