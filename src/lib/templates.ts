import type { WhatsAppTemplate } from "./meta/types";

export type TemplateVariable = {
  index: number;
  placeholder: string;
  example: string;
  context: string;
};

export function getBodyComponent(template: WhatsAppTemplate) {
  return template.components.find((c) => c.type === "BODY");
}

function buildContext(text: string, placeholder: string): string {
  const i = text.indexOf(placeholder);
  if (i === -1) return "";
  const start = Math.max(0, i - 28);
  const end = Math.min(text.length, i + placeholder.length + 28);
  const before = text.slice(start, i).replace(/\s+/g, " ");
  const after = text.slice(i + placeholder.length, end).replace(/\s+/g, " ");
  return `${start > 0 ? "…" : ""}${before}「${placeholder}」${after}${end < text.length ? "…" : ""}`;
}

export function extractVariables(template: WhatsAppTemplate): TemplateVariable[] {
  const body = getBodyComponent(template);
  if (!body?.text) return [];

  const matches = Array.from(body.text.matchAll(/\{\{(\d+)\}\}/g));
  const examples = body.example?.body_text?.[0] ?? [];

  const unique = new Map<number, TemplateVariable>();
  for (const m of matches) {
    const idx = Number.parseInt(m[1], 10);
    if (!unique.has(idx)) {
      unique.set(idx, {
        index: idx,
        placeholder: m[0],
        example: examples[idx - 1] ?? "",
        context: buildContext(body.text, m[0]),
      });
    }
  }
  return [...unique.values()].sort((a, b) => a.index - b.index);
}

export function renderPreview(template: WhatsAppTemplate, values: Record<string, string>) {
  const body = getBodyComponent(template);
  if (!body?.text) return "";
  return body.text.replace(/\{\{(\d+)\}\}/g, (_, n) => values[n] ?? `{{${n}}}`);
}

export function isSendable(template: WhatsAppTemplate) {
  return template.status === "APPROVED";
}
