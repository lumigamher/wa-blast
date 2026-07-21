import type { LlmMessage } from "./providers/types";

const GLOBAL_RULES = `Reglas:
- Responde en español, natural y breve, como un humano por WhatsApp.
- Para cualquier cálculo, búsqueda o acción usa SIEMPRE una herramienta; nunca inventes números ni datos.
- Si no puedes resolver algo o el cliente pide una persona, usa la herramienta escalar_a_humano.`;

/**
 * Reglas integradas del flujo de pedidos: NO dependen del prompt que escriba
 * cada negocio. Se inyectan solo si la org tiene las tools activas, y se
 * adaptan a cuáles (dirección, cotización, pagos).
 */
function buildOrderFlowRules(toolNames: string[]): string {
  if (!toolNames.includes("crear_pedido")) return "";
  const hasDireccion = toolNames.includes("guardar_direccion_envio");
  const hasCotizar = toolNames.includes("cotizar_envio");
  const hasPagos = [
    "medios_de_pago",
    "generar_link_pago",
    "enviar_qr_pago",
    "registrar_pago",
    "enviar_checkout",
  ].some((t) => toolNames.includes(t));

  const pasos: string[] = [
    "1. Arma el pedido con crear_pedido apenas el cliente defina qué quiere; confirma productos y cantidades.",
  ];
  if (hasDireccion) {
    pasos.push(
      `${pasos.length + 1}. Pide SIEMPRE la dirección de entrega (dirección, barrio, ciudad, quién recibe y su teléfono) antes de cerrar el pedido, y guárdala con guardar_direccion_envio. Si la ficha del cliente o el pedido ya traen dirección, no la vuelvas a pedir: confírmala en una línea ("¿te lo enviamos a …?").`,
    );
  }
  if (hasCotizar) {
    pasos.push(
      `${pasos.length + 1}. Cotiza el envío con cotizar_envio en cuanto sepas la ciudad de destino, e informa al cliente el costo y el tiempo de entrega ANTES de hablar de pago. El total a cobrar es productos + envío.`,
    );
  }
  if (hasPagos) {
    pasos.push(
      `${pasos.length + 1}. Solo cuando la dirección esté confirmada${hasCotizar ? " y el envío cotizado" : ""}, informa el total final y ofrece el medio de pago.`,
    );
  }

  return (
    `\n\n## Flujo de pedidos (síguelo siempre, en este orden)\n` +
    pasos.join("\n") +
    `\n- Nunca des un pedido por cerrado sin dirección de entrega confirmada${hasCotizar ? " ni sin haber informado el costo de envío" : ""}.`
  );
}

export function buildSystemPrompt(config: {
  name: string;
  systemPrompt: string;
  knowledge?: string;
  customerProfile?: string;
  toolNames?: string[];
}): string {
  let out = `Eres ${config.name}, un asistente de WhatsApp.\n\n${config.systemPrompt}\n\n${GLOBAL_RULES}`;
  if (config.toolNames?.length) {
    out += buildOrderFlowRules(config.toolNames);
  }
  if (config.customerProfile && config.customerProfile.trim()) {
    out += `\n\n## Ficha del cliente (lo que ya sabemos — úsala, no vuelvas a preguntar lo que ya está):\n${config.customerProfile.trim()}`;
  }
  if (config.knowledge && config.knowledge.trim()) {
    out += `\n\nInformación de la empresa (úsala para responder; si la respuesta no está aquí, dilo o escala, no inventes):\n${config.knowledge.trim()}`;
  }
  return out;
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
