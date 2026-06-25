# Manejo de contexto del agente: ficha del cliente (persistir + inyectar)

**Fecha:** 2026-06-25
**Proyecto:** Lula (wa-blast) — agente IA
**Estado:** Diseño aprobado

## Contexto y motivación

Hoy el agente maneja el contexto sólo con el **transcript** (últimos
`HISTORY_LIMIT=20` mensajes) + el bloque RAG. Problemas:
- `recopilar_datos` es **no-op**: el agente "recopila" datos del cliente
  (nombre, ciudad, etc.) pero **no se persisten** en ningún lado → se pierden y
  el agente depende de releer el chat.
- No hay una **ficha del cliente** estructurada que el agente conozca sin
  arrastrar toda la conversación.

Luis quiere: que el agente NO recuerde toda la conversación, sino **datos
estructurados** — ficha de contacto, direcciones, medios de pago recurrentes,
pedidos — y que tenga una **tool que llene esa ficha**, inyectada en el contexto
tal cual.

Hechos verificados:
- `contacts`: id, orgId, phone, name, email, company, notes, birthday, city, …
- `recopilar_datos` (`tools/builtin/recopilar-datos.ts`): retorna `{recogidos}` y
  NO escribe nada.
- `buildSystemPrompt({name, systemPrompt, knowledge})` (`agent/context.ts`)
  arma el system prompt; `turn.ts` lo llama y carga la history con `HISTORY_LIMIT`.
- Pedidos (`orders`): shipping_address_json, payment_method, items, total, status.

## Alcance

Dentro: persistir la ficha (tool `recopilar_datos` que escribe) + un `data_json`
flexible en el contacto + `buildCustomerProfile` que arma la ficha (contacto +
direcciones + pago habitual + pedidos) + inyección en el system prompt + reducir
el window de history. Fuera: UI de la ficha en el panel (se ve hoy en
`/contactos/[id]`), embeddings/semántica sobre la ficha.

## Componente 1 — `contacts.data_json` (memoria flexible)

Migración aditiva: columna `contacts.dataJson` (`text("data_json")`, default
`"{}"`). Guarda pares clave→valor arbitrarios que el agente aprenda y que no
caben en las columnas fijas (ej. `{"segmento":"mayorista","horario":"después de
las 6"}`).

## Componente 2 — La tool que llena la ficha (`recopilar_datos` persiste)

`recopilar_datos` deja de ser no-op. Su `run(args, ctx)`:
1. Resuelve el `contactId` de la conversación (`conversations.contactId` vía
   `ctx.conversationId`); si no hay contacto, no rompe (retorna ok con aviso).
2. Para cada `campo:valor` de `campos`:
   - Si el campo mapea a una columna conocida del contacto
     (`nombre|name→name`, `ciudad|city→city`, `email→email`,
     `empresa|company→company`, `cumpleaños|birthday→birthday`,
     `notas|notes→notes`), lo escribe en esa columna (sólo si llega no vacío;
     no pisa con vacío).
   - Cualquier otro campo se **mergea** en `contacts.data_json` (lee el JSON
     actual, set de la clave, guarda).
3. Capa `src/lib/agent/customer/profile.ts` (o `contacts` helper):
   `saveContactFacts(db, orgId, contactId, campos)` — todo scoped por org.
4. Retorna `{ ok:true, data:{ guardados: <claves> } }`.
Descripción de la tool actualizada: "Guarda en la ficha del cliente los datos que
proporcione (nombre, ciudad, email, empresa, o cualquier dato útil como
preferencias)."

## Componente 3 — `buildCustomerProfile` (armar la ficha)

`src/lib/agent/customer/profile.ts`:
`buildCustomerProfile(db, orgId, conversationId): Promise<string>` → un bloque de
texto (vacío si no hay datos) con:
- **Cliente**: name, city, email, company, notes (los que existan) + las claves
  de `data_json`.
- **Direcciones conocidas**: de los últimos pedidos del contacto
  (`shipping_address_json`), dedup por texto, máx 3.
- **Medio de pago habitual**: el `payment_method` más frecuente (o el último) de
  sus pedidos.
- **Pedidos recientes** (máx 5): `numeroCorto` + items resumidos + total + estado
  + fecha.
Todo scoped por org + contacto (vía `conversations.contactId`).

## Componente 4 — Inyección en el system prompt

`buildSystemPrompt` gana un param `customerProfile?: string` que se renderiza como
una sección "## Ficha del cliente (lo que ya sabemos)\n<bloque>" antes/junto al
bloque de conocimiento (RAG). `turn.ts` llama `buildCustomerProfile` (try/catch:
si falla, sigue sin ficha, igual que el RAG) y lo pasa. La ficha se inyecta **tal
cual** (texto plano legible por el modelo).

## Componente 5 — Menos transcript crudo

`turn.ts`: `HISTORY_LIMIT` de **20 → 10** (constante `AGENT_HISTORY_LIMIT`
configurable por env). La ficha ya carga lo durable, así que el window corto basta
para la conversación inmediata.

## Testing

- `saveContactFacts`: mapea campos conocidos a columnas; mergea desconocidos en
  data_json sin pisar lo previo; no escribe vacío; scoped por org.
- `recopilar_datos.run`: persiste (con `ctx` mockeado / makeTestDb), no rompe si
  no hay contacto.
- `buildCustomerProfile`: arma el bloque desde contacto + data_json + pedidos
  (direcciones dedup, pago habitual, pedidos recientes); vacío si no hay datos;
  scoped por org.
- `buildSystemPrompt`: incluye la sección de ficha cuando se pasa `customerProfile`.

## Migración y despliegue

Migración aditiva (`contacts.data_json`). Rama `feat/agente-ficha-cliente` →
subagentes TDD → review → merge → deploy. Verificación en vivo en la org 49644ae3:
dar un dato ("soy mayorista", una dirección, un nombre) → el agente lo guarda y en
el siguiente turno lo "recuerda" sin que esté en los últimos 10 mensajes.

## Riesgos / notas

- La ficha puede crecer; limitar pedidos/direcciones (máx 5/3) y truncar el bloque
  a un tamaño razonable (~1500 chars) para no inflar el prompt.
- `data_json` lo escribe el modelo vía la tool → validar que `campos` sean
  strings/números (ya lo hace el zod schema); claves en minúscula/normalizadas.
- No romper el turno si falta contacto o si el JSON está corrupto (safeParse).
