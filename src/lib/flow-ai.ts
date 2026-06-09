import Anthropic from "@anthropic-ai/sdk";

export function extractFlowJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("La respuesta no contenía JSON");
  const slice = candidate.slice(start, end + 1);
  JSON.parse(slice); // throws if invalid
  return slice;
}

const SYSTEM = `Generas WhatsApp Flow JSON para formularios de captura de leads. Devuelve SOLO JSON válido, sin markdown ni texto.

Esquema (Flow JSON version "6.3", estático, sin data_api_version ni endpoint):
- Nivel superior: { "version": "6.3", "screens": [ ...Screen ] }
- Screen: { "id": "SCREEN_ID" (MAYÚSCULAS_SNAKE), "title": "Título", "terminal": true (SOLO en la última), "success": true (en la terminal), "data": {}, "layout": Layout }
- Layout: { "type": "SingleColumnLayout", "children": [ Form ] }
- Form: { "type": "Form", "name": "form", "children": [ ...componentes, Footer ] }
- Componentes: TextHeading/TextBody/TextSubheading { "type", "text" }; TextInput { "type":"TextInput","name":"campo","label":"...","input-type":"text|email|number|phone","required":true }; TextArea similar; Dropdown/RadioButtonsGroup/CheckboxGroup { "type","name","label","required","data-source":[{"id":"1","title":"Opción"}] }; DatePicker { "type":"DatePicker","name","label" }.
- Footer (último hijo del Form): { "type":"Footer","label":"Enviar","on-click-action":{ "name":"complete","payload":{ "campo":"\${form.campo}" } } }. Multi-pantalla: pantallas no terminales usan { "name":"navigate","next":{ "type":"screen","name":"SIGUIENTE_ID" },"payload":{...} }; la terminal usa "complete".

Reglas: ≥1 pantalla; exactamente una terminal (la última) con "terminal":true y "success":true; "name" de componentes en snake_case minúsculas; ids de pantalla en MAYÚSCULAS_SNAKE; incluye los campos pedidos + por defecto nombre y teléfono si no se especifican; etiquetas en español salvo que la petición esté en otro idioma.`;

export async function generateFlowJson(request: string): Promise<string> {
  const { env } = await import("@/lib/env");
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  async function ask(extra?: string): Promise<string> {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Genera el Flow JSON para: ${request}${extra ? `\n\n${extra}` : ""}` }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }
  const first = await ask();
  try {
    return JSON.stringify(JSON.parse(extractFlowJson(first)), null, 2);
  } catch {
    const second = await ask("Tu salida anterior no era JSON válido. Devuelve SOLO el JSON del Flow, sin texto.");
    return JSON.stringify(JSON.parse(extractFlowJson(second)), null, 2);
  }
}
