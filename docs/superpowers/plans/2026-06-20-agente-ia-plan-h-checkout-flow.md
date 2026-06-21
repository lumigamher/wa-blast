# Agente IA — Plan H: Flow de checkout (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Que el agente envíe un **resumen del pedido + un WhatsApp Flow de checkout** (Flow publicado por la org) que recoge el medio de pago elegido y datos de entrega. La respuesta del Flow se captura en `flow_responses` (ya existe). El cobro real sigue por link (G) o manual (F). (Pago in-Flow no existe en Colombia.)

**Architecture:** El tool `enviar_checkout` resuelve el pedido, arma un resumen de texto, y como efecto secundario envía: (1) el resumen vía `sendText`, (2) el Flow de checkout vía `sendFlow(flowId)` usando el `checkoutFlowId` configurado por la org. Las herramientas pueden hacer side-effects: cargan `getOrgSettings(db, orgId)` y el teléfono de la conversación.

**Tech Stack:** TS, Drizzle, Vitest. Reusa `sendText`/`sendFlow` (`src/lib/meta/client.ts`), `getOrgSettings` (`src/lib/org/settings.ts`), `orders`, `agentConfigs`, `conversations`.

**Decisión (Luis):** Flow de checkout (no pago in-Flow). El resumen del pedido va como texto (sendFlow no acepta JSON inline → el Flow es estático/publicado).

---

## File Structure
- `domain.ts` (MOD) — `agentConfigs.checkoutFlowId` (columna).
- `src/lib/agent/payments/summary.ts` — `buildOrderSummaryText(order)` (puro).
- `src/lib/agent/tools/builtin/enviar-checkout.ts` + registro.
- Panel `_form.tsx` (MOD) — campo "Flow de checkout (ID)".

---

### Task 1: Schema — `checkoutFlowId` en agent_configs
**Files:** `domain.ts`. En la tabla `agentConfigs`, añade:
```ts
  checkoutFlowId: text("checkout_flow_id"),
```
- [ ] `db:generate` → 0020 (ALTER TABLE agent_configs ADD checkout_flow_id; verifica que sea solo eso; migrate fresco OK). tsc clean. Actualiza el DEFAULTS de `src/lib/agent/config.ts` añadiendo `checkoutFlowId: null` (para que el objeto sintético de getAgentConfig siga teniendo todas las columnas). **commit** `feat(agent): agent_configs.checkoutFlowId`

---

### Task 2: `summary.ts` — resumen de pedido (puro) + test
**Files:** `src/lib/agent/payments/summary.ts` + test.
```ts
type OrderLike = { id: string; totalCop: number; itemsJson: string };

export function buildOrderSummaryText(order: OrderLike): string {
  let items: Array<{ nombre?: string; cantidad?: number; subtotal?: number }> = [];
  try { items = JSON.parse(order.itemsJson); } catch { items = []; }
  const fmt = (n: number) => `$${new Intl.NumberFormat("es-CO").format(n)}`;
  const lines = items.map((i) => `• ${i.cantidad ?? 1}x ${i.nombre ?? "Producto"} — ${fmt(i.subtotal ?? 0)}`);
  return [`Resumen de tu pedido (${order.id.slice(0, 8)}):`, ...lines, `Total: ${fmt(order.totalCop)}`].join("\n");
}
```
- [ ] TDD: itemsJson con 2 items → texto con líneas y total; itemsJson inválido → al menos el total. tsc clean. **commit** `feat(agent): buildOrderSummaryText`

---

### Task 3: Tool `enviar_checkout` (side-effect) + test
**Files:** `src/lib/agent/tools/builtin/enviar-checkout.ts` + test; registro.

Comportamiento (`run(args, ctx)`):
- schema `z.object({ orderId: z.string().optional() })`.
- Resuelve el pedido (dado o último "pendiente" de la conversación) — si no hay → `{ok:false, error:"No hay un pedido para enviar"}`.
- `const config = await getAgentConfig(ctx.db, ctx.orgId)`; si `!config.checkoutFlowId` → `{ok:false, error:"No hay Flow de checkout configurado"}`.
- `const settings = await getOrgSettings(ctx.db, ctx.orgId)` (creds Meta). Teléfono: de la conversación (`conversations.phone`).
- Envía: `await sendText(settings, { to: phone, body: buildOrderSummaryText(order) })` y luego `await sendFlow(settings, { to: phone, flowId: config.checkoutFlowId, bodyText: "Completa tu compra", cta: "Pagar" })`. (Verifica los nombres reales de `SendFlowParams` — `flowId`, `bodyText`, `cta`.)
- Devuelve `{ ok:true, data:{ enviado:true, orderId: order.id } }`. Si algún send devuelve `{error}`, devuelve `{ok:false, error}`.
- Description (ES): "Envía al cliente el resumen del pedido y el formulario de checkout (Flow) para que elija medio de pago y datos de entrega."
- `escalates:false`.

**Test:** mock `globalThis.fetch` (sendText/sendFlow usan fetch) — devolver `{messages:[{id:"x"}]}` con status 200. Sembrar org + organizationSettings (con metaPhoneId + metaAccessToken cifrado... usa el patrón de otros tests que siembran settings, o `saveOrgSettings`) + conversación con phone + un pedido pendiente + `saveAgentConfig(db, orgId, { checkoutFlowId: "123" })`. Ejecutar → ok:true; fetch llamado 2 veces. Casos: sin pedido → ok:false; sin checkoutFlowId → ok:false. Si sembrar settings con creds es complejo, revisa cómo `getOrgSettings` lee y cómo otros tests lo siembran (`organizationSettings` con `metaAccessTokenEnc = encrypt(token)`).
- [ ] TDD + registrar en BUILTIN_TOOLS (`enviar_checkout`) + tsc + lint. **commit** `feat(agent): tool enviar_checkout (resumen + Flow de checkout)`

---

### Task 4: Panel — campo Flow de checkout
**Files:** `_form.tsx` (MOD) — en modo avanzado, un input "Flow de checkout (ID del Flow publicado)" enlazado a `checkoutFlowId`, guardado vía `saveAgentConfigAction` (añadir `checkoutFlowId` al input que ya maneja). Nota: "Publica un Flow con los campos de pago/entrega en la sección Flows y pega su ID aquí."
- [ ] tsc + lint + build. **commit** `feat(agent): panel — campo Flow de checkout`

---

### Task 5: Gauntlet + merge + deploy
- [ ] `bunx tsc --noEmit && bun run lint && bun run test && bun run build` verde.

---

## Self-Review
- sendFlow requiere flow_id publicado → el Flow de checkout lo crea/publica la org en /flows y pega el id en el panel. El resumen del pedido va como texto antes del Flow (el Flow es estático).
- La respuesta del Flow (medio de pago + entrega) la captura `flow_responses` (Plan flows) → visible en /flows/respuestas; enlazarla al pedido automáticamente queda como mejora futura.
- Tools con side-effects: `enviar_checkout` carga settings + envía. Patrón nuevo pero acotado.
- Sin checkoutFlowId o sin pedido → ok:false claro.

## Cierre del producto Agente IA
Con A–H: motor + WhatsApp + panel + agenda + catálogo (3 fuentes) + pagos (manual con comprobante, link EfiPay, checkout Flow). Siguiente capacidad disponible: RAG/documentos.
