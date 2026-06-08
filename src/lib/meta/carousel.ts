import type { WhatsAppTemplate } from "./types";

export function isCarousel(t: WhatsAppTemplate): boolean {
  return t.components.some((c) => c.type === "CAROUSEL");
}

function varIndices(text: string | undefined): number[] {
  if (!text) return [];
  const seen = new Set<number>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) seen.add(Number.parseInt(m[1], 10));
  return [...seen].sort((a, b) => a - b);
}

export type ParsedCardButton = { type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER"; dynamicUrlSuffixKey?: string };
export type ParsedCard = { headerFormat: "IMAGE" | "VIDEO"; bodyVarKeys: string[]; buttons: ParsedCardButton[] };
export type ParsedCarousel = { topBodyVarKeys: string[]; cards: ParsedCard[] };

export function parseCarousel(t: WhatsAppTemplate): ParsedCarousel {
  const topBody = t.components.find((c) => c.type === "BODY");
  const carousel = t.components.find((c) => c.type === "CAROUSEL");
  const cards: ParsedCard[] = (carousel?.cards ?? []).map((card, ci) => {
    const header = card.components.find((c) => c.type === "HEADER");
    const body = card.components.find((c) => c.type === "BODY");
    const buttonsComp = card.components.find((c) => c.type === "BUTTONS");
    const bodyVarKeys = varIndices(body?.text).map((n) => `card.${ci}.body.${n}`);
    const buttons: ParsedCardButton[] = (buttonsComp?.buttons ?? []).map((b, bi) => {
      const type = b.type as ParsedCardButton["type"];
      if (type === "URL" && b.url && /\{\{\d+\}\}/.test(b.url)) {
        return { type, dynamicUrlSuffixKey: `card.${ci}.button.${bi}.url` };
      }
      return { type };
    });
    return { headerFormat: (header?.format as "IMAGE" | "VIDEO") ?? "IMAGE", bodyVarKeys, buttons };
  });
  return { topBodyVarKeys: varIndices(topBody?.text).map((n) => `body.${n}`), cards };
}
