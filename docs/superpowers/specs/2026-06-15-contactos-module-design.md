# Módulo de Contactos mejorado — Lula (wa-blast)

**Fecha:** 2026-06-15
**Estado:** Aprobado, pendiente de plan de implementación

## Objetivo

Perfeccionar el módulo de contactos de Lula: permitir **alta manual** de contactos,
**mejorar la información** que se guarda de cada contacto, y dar una **ficha de
contacto** (detalle) usable y editable. Hoy `/contactos` es solo una tabla plana
de lectura con import CSV y tags; no hay forma de crear, editar, ver el detalle ni
borrar un contacto individual.

## Contexto del código actual

- **Schema `contacts`** (`src/lib/db/schema/domain.ts`): `id, orgId, phone, name,
  email, customFields (JSON), optOutAt, createdAt, updatedAt`. Único por `(orgId, phone)`.
- **Tags**: tablas `tags` + `contactTags` (M2M) ya existen, con `createTag`/`deleteTag`.
- **`/contactos/page.tsx`**: tabla (nombre, teléfono, tags, email, estado opt-out) +
  búsqueda por nombre/teléfono (LIKE, límite 500). Sin alta, edición ni detalle.
- **`/contactos/actions.ts`**: `listContactsAction`, import (`validate`/`commit`),
  `toggleOptOutAction`. Patrón: `requireOrg()` → `db` → `revalidatePath`.
- **`src/lib/contacts/`**: `upsert.ts` (usado por import), `import.ts`, `tags.ts`,
  `phone.ts` (normalización), todo testeable con `makeTestDb`.
- **`conversations`** tiene `contactId` (FK, `set null`) y `phone` → la ficha puede
  enlazar a la conversación del inbox.
- **UI disponible** (`src/components/ui/`): `dialog`, `select`, `badge`, `input`,
  `label`, `tabs`, `checkbox`, `card`, `button`, `sonner`. **No existe `sheet`** →
  se añadirá para el drawer.
- **Inbox** ya tiene un `ContactInfoToggle` (panel de solo-lectura con avatar +
  notas de conversación). No se modifica en este alcance.

## Decisiones de diseño (acordadas)

- **Ficha**: ambos patrones — **drawer peek** (Sheet) desde la lista para vistazo y
  edición rápida + **página dedicada** `/contactos/[id]` para la vista completa.
- **Campos nuevos de primera clase**: Empresa, Notas de contacto, Cumpleaños, Dirección/Ciudad.
- **Alta manual**: **diálogo modal** desde la lista.

## Arquitectura

### 1. Modelo de datos (migración aditiva, no-destructiva)

Añadir a `contacts` (todas nullable):

| Columna     | Tipo   | Uso                                                              |
|-------------|--------|------------------------------------------------------------------|
| `company`   | text   | Empresa / negocio                                                |
| `notes`     | text   | Notas del contacto (campo libre; distinto de notas de inbox)     |
| `birthday`  | text   | Fecha ISO `YYYY-MM-DD` (sin timezone, evita bugs de zona horaria)|
| `city`      | text   | Ciudad / dirección                                               |

`customFields` (JSON) se mantiene para datos arbitrarios y será **editable** desde la ficha.

**Migración:** `bun run db:generate` (drizzle-kit). 

> ⚠️ **Coordinación con la sesión paralela de Calling API.** Ambas tocan migraciones
> drizzle. Los cambios son aditivos (esta sesión: columnas en `contacts`; la otra:
> tabla `calls`) → no hay conflicto lógico, pero el *journal* de drizzle
> (`_journal.json` + snapshots) puede colisionar si ambas generan a la vez. Plan:
> generar la migración en esta rama; si la otra sesión ya generó una, **renumerar**
> para que el journal quede secuencial antes de aplicar. Vigilar el bug conocido de
> iCloud que duplica directorios como `migrations 2` — no commitear duplicados.

### 2. Capa de datos / acciones de servidor

Lógica pura y testeable en **`src/lib/contacts/mutations.ts`** (recibe `db`, `orgId`),
expuesta vía server actions en `src/app/(app)/contactos/actions.ts`. Todas usan
`requireOrg()`, hacen scope por `orgId`, y retornan un resultado discriminado
`{ ok: true, ... } | { ok: false, error: string }`.

- **`createContact(db, orgId, input)`** / `createContactAction`
  - Normaliza teléfono con `lib/contacts/phone` + `settings.defaultCountry`.
  - Valida: teléfono no vacío y normalizable; email opcional con formato válido (zod).
  - Unicidad `(orgId, phone)`: si ya existe → `{ ok: false, error, existingId }`
    para que la UI ofrezca link a la ficha existente.
  - Inserta con `id = c_${randomUUID}`, timestamps, `customFields` `{}` por defecto.
- **`updateContact(db, orgId, id, patch)`** / `updateContactAction`
  - Patch parcial: cualquiera de `name, email, company, notes, birthday, city, customFields`.
  - `customFields` se mergea (no se pisa) salvo que el patch lo reemplace explícitamente.
  - Actualiza `updatedAt`. No permite cambiar `phone` en v1 (YAGNI; evita romper unicidad/conversaciones).
- **`deleteContact(db, orgId, id)`** / `deleteContactAction`
  - Borra el contacto; `contactTags` cae por cascade. `conversations.contactId` → `set null`.
- **`setContactTags(db, orgId, id, tagIds)`** / `setContactTagsAction`
  - Reemplaza el set de tags del contacto (valida que los tags pertenezcan al org).
- **`getContact(db, orgId, id)`** / `getContactAction`
  - Devuelve contacto + tags + `{ conversationId, lastMessageAt }` si existe conversación.

Revalidan `/contactos` y `/contactos/[id]` según corresponda.

### 3. UI

**a) Lista `/contactos/page.tsx` (mejora)**
- Header: botón **"Nuevo contacto"** que abre `NuevoContactoDialog` (client, modal).
  Campos: teléfono\* , nombre, email, empresa, tags. Al crear con éxito → toast + refresh;
  si duplicado → error inline con link a la ficha existente.
- Filas clickeables → abren el **drawer peek** (`ContactoPeek`, Sheet lateral).
- Nueva columna **Empresa**. Se mantiene opt-out toggle y búsqueda existente
  (opcional: extender el LIKE a `email`/`company`).

**b) Drawer peek — `ContactoPeek` (Sheet nuevo)**
- Avatar + nombre, teléfono (solo lectura), email, empresa, notas — editables inline
  (guardan vía `updateContactAction`).
- Tags (asignar/quitar vía `setContactTagsAction`).
- Link a conversación si existe; botones **"Abrir ficha completa"** (→ `/contactos/[id]`)
  y **"Borrar"** (con confirmación).

**c) Ficha `/contactos/[id]/page.tsx` (Server Component)**
- Header: avatar grande, nombre, teléfono, email, empresa; botones Editar / Borrar.
- Secciones (tabs o stacked):
  - **Datos**: todos los campos (incl. cumpleaños, ciudad) + editor de custom fields (pares clave/valor).
  - **Tags**: gestión inline.
  - **Notas**: textarea de `notes`.
  - **Conversación**: link a `/inbox/[conversationId]` + último mensaje, si existe.
  - **Llamadas**: *placeholder* extensible. No se implementa aquí — lo llenará la
    sesión de Calling API cuando exista la tabla `calls`. Solo se deja el hueco visual.
- `404` (`notFound()`) si el contacto no existe o no es del org.

**Componente nuevo:** `src/components/ui/sheet.tsx` (shadcn, vía MCP shadcn para no alucinar props).
Se reutilizan `dialog`, `select`, `badge`, `input`, `label`, `tabs`, `button`, `sonner`.

### 4. Validación y manejo de errores

- **Teléfono**: normalizado (`phone.ts` + `defaultCountry`). Vacío/inválido → error en form.
  Duplicado → mensaje "Ya existe un contacto con ese teléfono" + link a su ficha.
- **Email**: opcional; si se da, formato válido (zod). 
- **Cumpleaños**: `<input type="date">` → string ISO; vacío permitido.
- Todas las acciones retornan `{ ok, error? }`; la UI muestra errores con `sonner`/inline,
  nunca lanza sin manejar.

### 5. Tests (Vitest + `makeTestDb`)

`src/lib/contacts/mutations.test.ts`:
- `createContact`: normaliza teléfono; rechaza duplicado en el mismo org (devuelve `existingId`);
  permite el mismo teléfono en otro org; setea customFields por defecto.
- `updateContact`: patch parcial; **mergea** customFields sin perder claves previas; actualiza `updatedAt`.
- `deleteContact`: elimina el contacto y sus `contactTags` (cascade).
- `setContactTags`: reemplaza el set; rechaza tags de otro org.
- Edge: teléfono inválido → error; email inválido → error.

## Componentes y sus responsabilidades

| Unidad | Qué hace | Depende de |
|---|---|---|
| `lib/contacts/mutations.ts` | CRUD puro de contactos + tags (db, orgId) | `db`, `schema`, `phone.ts`, `zod` |
| `contactos/actions.ts` (nuevas) | Server actions: auth + revalidate, delega en mutations | `requireOrg`, mutations |
| `NuevoContactoDialog` | Modal de alta manual | `dialog`, `createContactAction` |
| `ContactoPeek` | Drawer de vistazo/edición rápida | `sheet`, update/delete/setTags actions |
| `contactos/[id]/page.tsx` | Ficha completa (SSR) | `getContactAction`, sub-componentes |
| `components/ui/sheet.tsx` | Primitiva de drawer (shadcn) | radix |

## Fuera de alcance (YAGNI)

- Historial de **llamadas** (lo implementa la sesión de Calling API; aquí solo el placeholder).
- Bulk-edit, merge de duplicados, cambios al flujo de import.
- Cambiar el teléfono de un contacto existente.
- Notas como hilo timestamped (eso ya existe a nivel conversación en el inbox).
- Modificar el `ContactInfoToggle` del inbox.

## Criterios de aceptación

1. Puedo crear un contacto manualmente desde `/contactos` (modal), con teléfono normalizado
   y error claro si está duplicado.
2. Puedo ver y editar todos los campos (incl. empresa, notas, cumpleaños, ciudad, custom fields)
   desde el drawer y desde la ficha `/contactos/[id]`.
3. Puedo asignar/quitar tags y borrar un contacto.
4. La ficha enlaza a la conversación del contacto si existe, y muestra un placeholder de Llamadas.
5. `bun run lint && bun run typecheck && bun test` en verde, con tests nuevos de `mutations`.
