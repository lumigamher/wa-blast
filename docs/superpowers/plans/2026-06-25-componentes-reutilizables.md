# Componentes reutilizables (master-detail + filtros) + detalle de pedidos completo — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Eliminar la duplicación inbox/pedidos extrayendo componentes compartidos (shell maestro-detalle + modal de filtros) y completar el detalle de pedidos (cliente + orden).

**Architecture:** `MasterDetailShell` y `FilterDialog` compartidos en `(app)/_components/`, usados por inbox y pedidos. El detalle de pedidos muestra toda la info (cliente con teléfono + link al chat, dirección completa, items, pago+comprobante, envío, #N, fecha).

**Convenciones:** typecheck `bunx tsc --noEmit` (borra `.next/types/* 2.ts` si molesta); build `bun run build` (DEBE pasar — valida inbox Y pedidos); lint `bun run lint`. Sin emojis (lucide). Commits terminan `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Hechos:**
- `inbox/_components/inbox-shell.tsx` (client, usePathname `^/inbox/.+`) y `pedidos/_components/orders-shell.tsx` (regex `^/pedidos/.+`) son casi idénticos → 1 shell parametrizado por `basePath`.
- El modal de filtros vive INLINE en `inbox/_components/conversation-list-pane.tsx` (Dialog + draft state + Aplicar/Limpiar, botón "Filtros" con SlidersHorizontal + contador). Pedidos usa botones crudos (malos).
- `getOrder` devuelve `{...order, phone, contactName, numero}` (joins a conversations+contacts). El detalle hoy usa `customer = contactName || phone` (un solo string).

---

## Task 1: `MasterDetailShell` compartido

**Files:** Create `src/app/(app)/_components/master-detail-shell.tsx`; Modify `inbox/layout.tsx`, `pedidos/layout.tsx`; Delete `inbox/_components/inbox-shell.tsx`, `pedidos/_components/orders-shell.tsx`.

- [ ] **Step 1:** Crea `master-detail-shell.tsx` (`"use client"`): props `{ basePath: string; list: React.ReactNode; detail: React.ReactNode; listWidthClass?: string }`. `const hasDetail = new RegExp(\`^${basePath}/.+\`).test(usePathname());`. Render igual que los shells actuales (lista `${listWidthClass ?? "md:w-[360px]"}` oculta en móvil cuando hay detalle; detalle `flex-1`). El back link móvil va a `basePath`.
- [ ] **Step 2:** `inbox/layout.tsx` usa `<MasterDetailShell basePath="/inbox" listWidthClass="md:w-[360px]" list={list} detail={detail} />`. `pedidos/layout.tsx` usa `basePath="/pedidos" listWidthClass="md:w-[380px]"`. Borra los dos `*-shell.tsx`. Verifica que nada más los importe.
- [ ] **Step 3:** `bunx tsc --noEmit && bun run build`. Commit `refactor(ui): MasterDetailShell compartido (inbox + pedidos)`.

---

## Task 2: `FilterDialog` reutilizable + filtros de pedidos

**Files:** Create `src/app/(app)/_components/filter-dialog.tsx`; Modify `inbox/_components/conversation-list-pane.tsx`, `pedidos/_components/orders-list-pane.tsx`.

- [ ] **Step 1:** Crea `filter-dialog.tsx` (`"use client"`): un botón trigger "Filtros" (icono `SlidersHorizontal` + badge `activeCount` si >0) que abre un `Dialog` con `DialogHeader/Title` ("Filtros"), `children` (los controles draft que pasa cada vista) y `DialogFooter` con "Limpiar" (`onClear`) y "Aplicar" (`onApply`, cierra). Props: `{ activeCount: number; onOpen?: ()=>void; onApply: ()=>void; onClear: ()=>void; children: React.ReactNode }`. Maneja el `open` interno; al abrir llama `onOpen` (para resetear el draft).
- [ ] **Step 2: Inbox** — refactor `conversation-list-pane.tsx` para usar `<FilterDialog>` en vez del Dialog inline: mueve los controles draft (estado/agente/no-leídas/etiqueta) como `children`, pasa `activeCount`, `onOpen` (reset draft), `onApply` (construye params → router.replace, igual que hoy), `onClear`. NO cambies la lógica de filtros, solo el contenedor. Verifica que se ve igual.
- [ ] **Step 3: Pedidos** — en `orders-list-pane.tsx`, reemplaza los botones crudos de estado por `<FilterDialog>` con un solo control draft: **Estado** (segmented Todos/Pendiente/Confirmado/Pagado/Cancelado, sober, sin emoji). `onApply` construye `?status=` (preservando `page` si aplica) con `router.replace(..., {scroll:false})`; `onClear` limpia. `activeCount` = 1 si hay status. La búsqueda (si la hay) o el header quedan consistentes con el inbox.
- [ ] **Step 4:** `bunx tsc --noEmit && bun run build`. Commit `refactor(ui): FilterDialog reutilizable + filtros de pedidos en modal`.

---

## Task 3: Detalle de pedidos completo

**Files:** Modify `pedidos/@detail/[id]/page.tsx`, `pedidos/@detail/[id]/_detail.tsx`; quizá `getOrder` en `orders.ts` (añadir city del contacto si falta).

- [ ] **Step 1:** En `page.tsx`, pasa al `OrderDetail` los datos del cliente desglosados: `contactName`, `phone`, `conversationId` (de `order.conversationId`) en vez de un solo `customer` string. (Opcional: extiende el select de `getOrder` para traer `contacts.city` y pásalo.)
- [ ] **Step 2:** En `_detail.tsx`, rediseña el header/secciones para mostrar TODO, prolijo:
  - **Encabezado**: `Pedido #${numero}` + badge de estado + fecha (`createdAt`) + total.
  - **Cliente**: nombre + teléfono + (ciudad si viene) + un link "Ver chat" → `/inbox/${conversationId}` (si hay conversationId).
  - **Items**: cada uno con cantidad × nombre (variante) + subtotal.
  - **Pago**: método + comprobante (imagen).
  - **Envío**: dirección COMPLETA (destinatario, teléfono, dirección, barrio, ciudad, departamento, indicaciones) + cotización (transportadora, precio, días) si hay `quote`.
  - **Acciones**: dropdown de estado + toggle despachado (como hoy).
  Sin emojis; iconos lucide sobrios; secciones con buen espaciado.
- [ ] **Step 3:** `bunx tsc --noEmit && bun run build && bun run lint`. Commit `feat(pedidos): detalle completo de orden + cliente`.

---

## Task 4: Verificación final + deploy

- [ ] **Step 1:** `find .next/types -name "* 2.ts" -delete; bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build` → verde/pasa.
- [ ] **Step 2:** Merge a `main`, deploy (sin migración, health 200).
- [ ] **Step 3 (en vivo):** inbox y pedidos usan el mismo shell + el mismo modal de filtros; el detalle de pedidos muestra cliente completo (tel + link chat) + toda la orden + envío.

---

## Self-Review

- Reutilizables: Task 1 (shell) + Task 2 (FilterDialog) usados por inbox+pedidos. ✓
- Filtros pedidos arreglados (modal, no botones crudos): Task 2. ✓
- Detalle pedidos completo (cliente+orden+envío): Task 3. ✓
- Sin romper el inbox: build valida ambas rutas en cada task; no cambia la lógica de filtros del inbox, solo el contenedor. ✓
- Sin emojis; gotchas parallel-routes no aplican (no se mueven rutas). ✓
