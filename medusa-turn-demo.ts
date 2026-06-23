// Demo de turno real del agente contra el catálogo Medusa EN VIVO de El Man.
// Usa el LLM real (OPENAI_API_KEY del entorno) + makeMedusaCatalog apuntando a
// api.elmandelosteclados.com. NO toca la base de datos ni envía a WhatsApp.
// Uso: bunx tsx medusa-turn-demo.ts "mensaje del cliente"
import { z } from "zod";
import { makeMedusaCatalog } from "./src/lib/agent/integrations/catalog/medusa";
import { getProvider } from "./src/lib/agent/providers/index";
import { runAgentLoop } from "./src/lib/agent/runtime";
import type { AgentTool } from "./src/lib/agent/tools/types";

const PK = "pk_114437a5e6a89e6314e71bd2825b0ecd0cc9f4da399d565ccc8d1c58e4e656fb";
const catalog = makeMedusaCatalog({
  backendUrl: "https://api.elmandelosteclados.com",
  publishableKey: PK,
});

const buscarProducto: AgentTool = {
  name: "buscar_producto",
  description:
    "Busca productos en el catálogo por nombre. Úsalo cuando el cliente pregunta por productos o precios.",
  paramsSchema: z.object({ query: z.string().min(1) }),
  jsonSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  async run(args) {
    const { query } = args as { query: string };
    const productos = await catalog.search({ query, limit: 5 });
    return { ok: true, data: { productos } };
  },
};

const system = `Eres el asistente de ventas por WhatsApp de "El Man de los Teclados", una tienda de tecnología en Colombia (teclados, audífonos, accesorios gamer).
Responde en español, cálido y breve, como un vendedor humano por WhatsApp.
Cuando el cliente pregunte por productos o precios, usa la herramienta buscar_producto y responde con nombres y precios reales en COP (formato $99.000).
No inventes productos ni precios. Si no encuentras algo, dilo y ofrece alternativas.`;

const userMsg = process.argv[2] ?? "Hola, ¿tienen teclados mecánicos? ¿qué precio?";

(async () => {
  const provider = getProvider({ provider: "openai" });
  const result = await runAgentLoop({
    provider,
    model: process.env.DEMO_MODEL ?? "gpt-5-mini",
    temperature: 0.2,
    system,
    history: [{ role: "user", content: userMsg }],
    tools: [buscarProducto],
    maxSteps: 5,
    ctx: { db: null as never, orgId: "demo", conversationId: "demo" },
  });

  console.log("\n👤 CLIENTE:", userMsg);
  console.log("\n🔧 PASOS (tools ejecutadas):");
  for (const s of result.steps) {
    const r = s.result as { ok: boolean; data?: { productos?: unknown[] } };
    const n = r.ok && r.data?.productos ? r.data.productos.length : 0;
    console.log(`  - ${s.tool}(${JSON.stringify(s.args)}) → ${r.ok ? n + " productos" : "error"}`);
  }
  console.log("\n🤖 AGENTE:", result.reply);
  console.log("\nstatus:", result.status, "| tokens:", result.usage.promptTokens + "+" + result.usage.completionTokens);
})();
