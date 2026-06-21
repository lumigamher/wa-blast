import type { LlmMessage } from "./providers/types";

const GLOBAL_RULES = `Reglas:
- Responde en español, natural y breve, como un humano por WhatsApp.
- Para cualquier cálculo, búsqueda o acción usa SIEMPRE una herramienta; nunca inventes números ni datos.
- Si no puedes resolver algo o el cliente pide una persona, usa la herramienta escalar_a_humano.`;

export function buildSystemPrompt(config: {
  name: string;
  systemPrompt: string;
  knowledge?: string;
}): string {
  const base = `Eres ${config.name}, un asistente de WhatsApp.\n\n${config.systemPrompt}\n\n${GLOBAL_RULES}`;
  if (config.knowledge && config.knowledge.trim()) {
    return `${base}\n\nInformación de la empresa (úsala para responder; si la respuesta no está aquí, dilo o escala, no inventes):\n${config.knowledge.trim()}`;
  }
  return base;
}

export function toLlmHistory(
  msgs: { direction: "in" | "out"; body: string | null }[],
): LlmMessage[] {
  return msgs
    .filter((m) => m.body && m.body.trim() !== "")
    .map((m) =>
      m.direction === "in"
        ? { role: "user" as const, content: m.body as string }
        : { role: "assistant" as const, content: m.body as string },
    );
}
