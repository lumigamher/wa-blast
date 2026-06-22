# Panel del Agente: split por secciones + menú lateral + QR de pagos

**Goal:** Romper el monolito `/configuracion/agente` en 7 páginas, agregar un grupo "Agente IA" colapsable en el sidebar, y dar a los medios de pago un QR (imagen) que el agente envía por WhatsApp.

**Arquitectura:** Rutas anidadas bajo `src/app/(app)/configuracion/agente/` con un `layout.tsx` compartido; cada `page.tsx` hace `requireModuleAccess("agente")` + carga solo sus datos + renderiza su sección (los componentes `_form/_tools/_calendar/_catalog/_products/_payments/_documents` ya existen y NO cambian, salvo pagos). Sidebar: nueva `NAV_SECTION` con sub-links gated a Premium. QR: columna nueva + upload + tool de envío reusando `uploadMedia`/`sendMedia`.

**Tech:** Next 16 App Router (server components), Drizzle/sqlite, sonner, Vitest.

**Decisiones confirmadas:** Productos vive dentro de **Catálogo** (una página). Navegación **solo sidebar** (sin tabs). QR **+ el agente lo envía**.

---

## Estructura de rutas final
```
configuracion/agente/
  layout.tsx              (NEW)  encabezado "Agente IA" + wrapper
  page.tsx                (MOD)  → Configuración: AgentForm (persona/modelo/activar/tope)
  herramientas/page.tsx   (NEW)  AgentTools
  calendario/page.tsx     (NEW)  AgentCalendar
  catalogo/page.tsx       (NEW)  AgentCatalog + (si interno) AgentProducts
  pagos/page.tsx          (NEW)  AgentPayments (+ QR)
  documentos/page.tsx     (NEW)  AgentDocuments
  actividad/page.tsx      (NEW)  tabla de actividad (extraída a _activity.tsx)
```

Sidebar (`src/app/(app)/layout.tsx`): quitar el link único "Agente IA" de la sección "Cuenta"; añadir `NAV_SECTION` **"Agente IA"** con los 7 sub-links, cada uno `module: "agente"` (locked si no Premium).

---

## Task 1: layout compartido + extraer _activity

**Files:**
- Create: `src/app/(app)/configuracion/agente/layout.tsx`
- Create: `src/app/(app)/configuracion/agente/_activity.tsx`

- [ ] **Step 1: layout.tsx**

Crea un layout server-component que envuelve las páginas del agente con el encabezado común (back link + título). Mueve el `<header>` del page.tsx actual aquí:
```tsx
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireModuleAccess } from "@/lib/billing/require-module";

export default async function AgenteLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("agente");
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Agente IA</h1>
        <p className="text-sm text-muted-foreground">
          Configura y controla el comportamiento de tu asistente automático.
        </p>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: _activity.tsx**

Extrae la "Activity card" (tabla de runs + `STATUS_BADGE_MAP`) del `page.tsx` actual a un componente server `_activity.tsx` que recibe `runs`:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  /* copiar EXACTO el mapa del page.tsx actual */
};

type Run = {
  id: string;
  status: string;
  costCop: number;
  createdAt: Date;
};

export function AgentActivity({ runs }: { runs: Run[] }) {
  /* copiar EXACTO el JSX de la "Activity card" del page.tsx actual */
}
```
(El implementer debe copiar el mapa y el JSX verbatim del `page.tsx` actual para no perder estilos.)

- [ ] **Step 3: Verificar**

Run: `bunx tsc --noEmit` (puede fallar hasta que page.tsx se actualice en Task 2 — está OK, se corrige junto). Commit al final de Task 2.

---

## Task 2: page.tsx → solo Configuración + las 6 sub-páginas

**Files:**
- Modify: `src/app/(app)/configuracion/agente/page.tsx`
- Create: `herramientas/page.tsx`, `calendario/page.tsx`, `catalogo/page.tsx`, `pagos/page.tsx`, `documentos/page.tsx`, `actividad/page.tsx`

**Referencia:** el `page.tsx` actual contiene TODO el data-loading y render. Cada nueva página copia SOLO el loading + el componente que le toca, con `export const dynamic = "force-dynamic";` y `const { orgId } = await requireOrg();` al inicio. El `requireModuleAccess` ya lo hace el `layout.tsx`, así que en cada page basta `requireOrg`.

- [ ] **Step 1: page.tsx (Configuración)**

Reescribe `page.tsx` para que cargue solo `config` y renderice `<AgentForm config={config} />` (sin el header — ahora vive en layout):
```tsx
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getAgentConfig } from "@/lib/agent/config";
import { AgentForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function AgenteConfigPage() {
  const { orgId } = await requireOrg();
  const config = await getAgentConfig(db, orgId);
  return <AgentForm config={config} />;
}
```

- [ ] **Step 2: herramientas/page.tsx**
```tsx
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { agentTools } from "@/lib/db/schema";
import { AgentTools } from "../_tools";

export const dynamic = "force-dynamic";

export default async function HerramientasPage() {
  const { orgId } = await requireOrg();
  const toolRows = await db.select().from(agentTools).where(eq(agentTools.orgId, orgId));
  const enabledMap = Object.fromEntries(
    toolRows.filter((t) => t.type === "builtin").map((t) => [t.key, t.enabled]),
  );
  return <AgentTools enabled={enabledMap} />;
}
```

- [ ] **Step 3: calendario/page.tsx**
```tsx
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getCalendarConfig } from "@/lib/agent/integrations/calendar/config";
import { AgentCalendar } from "../_calendar";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const { orgId } = await requireOrg();
  const calendar = await getCalendarConfig(db, orgId);
  return (
    <AgentCalendar
      configured={!!calendar}
      current={{
        provider: calendar?.provider ?? "calcom",
        eventTypeId: calendar?.eventTypeId ?? 0,
        durationMin: calendar?.durationMin ?? 30,
        timezone: calendar?.timezone ?? "America/Bogota",
      }}
    />
  );
}
```

- [ ] **Step 4: catalogo/page.tsx** (provider + productos internos con imágenes)

Copia EXACTO el bloque de carga de catálogo+productos del page.tsx actual (catalogConfig, baseProductList, el `Promise.all` que arma variants+images con `listVariants`/`listImages`/`imageUrl`), y renderiza:
```tsx
      <AgentCatalog provider={catalogConfig?.provider ?? "internal"} config={catalogConfig?.config ?? {}} />
      {(catalogConfig?.provider === "internal" || !catalogConfig) && <AgentProducts items={productList} />}
```
(envuelto en un `<div className="space-y-6">`). Imports desde `../_catalog`, `../_products`, y los helpers `@/lib/agent/catalog/{variants,images}`, `@/lib/agent/admin` (listProducts).

- [ ] **Step 5: pagos/page.tsx**
```tsx
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listPaymentMethods } from "@/lib/agent/payments/methods";
import { AgentPayments } from "../_payments";

export const dynamic = "force-dynamic";

export default async function PagosPage() {
  const { orgId } = await requireOrg();
  const paymentList = await listPaymentMethods(db, orgId);
  return <AgentPayments items={paymentList} />;
}
```

- [ ] **Step 6: documentos/page.tsx**
```tsx
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listDocuments } from "@/lib/agent/rag/admin";
import { AgentDocuments } from "../_documents";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const { orgId } = await requireOrg();
  const documentList = await listDocuments(db, orgId);
  return (
    <AgentDocuments
      items={documentList.map((d) => ({
        id: d.id, name: d.name, status: d.status, chunkCount: d.chunkCount, source: d.source,
      }))}
    />
  );
}
```

- [ ] **Step 7: actividad/page.tsx**
```tsx
import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { AgentActivity } from "../_activity";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const { orgId } = await requireOrg();
  const runs = await db.select().from(agentRuns).where(eq(agentRuns.orgId, orgId)).orderBy(desc(agentRuns.createdAt)).limit(10);
  return <AgentActivity runs={runs} />;
}
```

- [ ] **Step 8: Verificar + commit**

Run: `bunx tsc --noEmit` (limpio), `bun run lint` (limpio). Commit:
```bash
git add "src/app/(app)/configuracion/agente"
git commit -m "refactor(agent): split panel into per-section routes + shared layout"
```

---

## Task 3: Sidebar — grupo "Agente IA"

**Files:** Modify `src/app/(app)/layout.tsx`

- [ ] **Step 1: Iconos**

Añade a los imports de lucide (los que falten): `WrenchIcon, CalendarIcon, PackageIcon, ActivityIcon, SlidersHorizontalIcon` (BotIcon, CreditCardIcon, FileTextIcon ya están).

- [ ] **Step 2: Quitar "Agente IA" de "Cuenta"**

En `NAV_SECTIONS`, sección "Cuenta", ELIMINA la línea:
`{ href: "/configuracion/agente", icon: BotIcon, label: "Agente IA", module: "agente" },`

- [ ] **Step 3: Añadir la sección del agente**

Inserta una nueva `NAV_SECTION` (antes de "Cuenta") en `NAV_SECTIONS`:
```ts
  {
    label: "Agente IA",
    items: [
      { href: "/configuracion/agente", icon: BotIcon, label: "Configuración", module: "agente" },
      { href: "/configuracion/agente/herramientas", icon: WrenchIcon, label: "Herramientas", module: "agente" },
      { href: "/configuracion/agente/calendario", icon: CalendarIcon, label: "Calendario", module: "agente" },
      { href: "/configuracion/agente/catalogo", icon: PackageIcon, label: "Catálogo", module: "agente" },
      { href: "/configuracion/agente/pagos", icon: CreditCardIcon, label: "Medios de pago", module: "agente" },
      { href: "/configuracion/agente/documentos", icon: FileTextIcon, label: "Base de conocimiento", module: "agente" },
      { href: "/configuracion/agente/actividad", icon: ActivityIcon, label: "Actividad", module: "agente" },
    ],
  },
```
> Ojo con el resaltado activo: `NavLink` usa "longest prefix wins", así que `/configuracion/agente` (Configuración) NO se marcará activo cuando estés en `/configuracion/agente/pagos` porque ese href más largo gana. Correcto. Pero `/configuracion` (Configuración general, en "Cuenta") sí podría competir — no, `/configuracion/agente*` empieza por `/configuracion/` y el `/configuracion` general solo matchea exacto o `/configuracion/` + algo que NO empiece por agente con prefijo mayor; el algoritmo ya resuelve por prefijo más largo. Verifica navegando.

- [ ] **Step 4: Verificar + commit**

Run: `bunx tsc --noEmit` + `bun run lint`. Commit:
```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(agent): dedicated 'Agente IA' sidebar group"
```

---

## Task 4: QR de pagos — schema + capa + migración

**Files:** Modify `src/lib/db/schema/domain.ts`, `src/lib/agent/payments/methods.ts`, `src/lib/agent/payments/methods.test.ts`; generate migration.

- [ ] **Step 1: Schema** — añade columna a `paymentMethods`:
```ts
    qrMediaAssetId: text("qr_media_asset_id"),
```
(después de `details`). Run `bun run db:generate` → migración 0023 con `ALTER TABLE payment_methods ADD ...`. Verifica el SQL.

- [ ] **Step 2: Capa** — en `payments/methods.ts` añade (TDD, primero el test):

Test en `methods.test.ts`:
```ts
  it("setPaymentMethodQr guarda y limpia el QR, scoped por org", async () => {
    const { db } = makeTestDb();
    // sembrar org + un método (reusa helpers del archivo)
    const m = await addPaymentMethod(db, "org1", { type: "nequi", label: "N", details: "300" });
    await setPaymentMethodQr(db, "org1", m.id, "media_abc");
    let list = await listPaymentMethods(db, "org1");
    expect(list[0].qrMediaAssetId).toBe("media_abc");
    await setPaymentMethodQr(db, "org1", m.id, null);
    list = await listPaymentMethods(db, "org1");
    expect(list[0].qrMediaAssetId).toBeNull();
  });
```
(Adapta el seeding de org/método a los helpers reales del archivo; revisa cómo `addPaymentMethod` retorna el id.)

Impl:
```ts
export async function setPaymentMethodQr(db: DB, orgId: string, id: string, mediaAssetId: string | null): Promise<void> {
  await db.update(paymentMethods)
    .set({ qrMediaAssetId: mediaAssetId })
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.orgId, orgId)));
}
```
(Asegura `and`/`eq` importados.)

- [ ] **Step 3: Verificar + commit**

Run: `bunx vitest run src/lib/agent/payments/methods.test.ts` → PASS. `bunx tsc --noEmit`. Commit:
```bash
git add src/lib/db/schema/domain.ts drizzle/migrations src/lib/agent/payments/methods.ts src/lib/agent/payments/methods.test.ts
git commit -m "feat(payments): QR media column + setPaymentMethodQr"
```

---

## Task 5: QR — endpoint de subida + acción borrar + UI dropzone

**Files:** Create `src/app/api/agent/payment-methods/[id]/qr/route.ts`; Modify `agente/actions.ts` y `_payments.tsx`.

- [ ] **Step 1: Endpoint** (espejo de `api/products/[id]/images/route.ts`):
```ts
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { paymentMethods } from "@/lib/db/schema";
import { saveMediaAsset } from "@/lib/media/store";
import { setPaymentMethodQr } from "@/lib/agent/payments/methods";

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [pm] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.orgId, orgId)));
  if (!pm) return NextResponse.json({ error: "Medio de pago no encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Imagen muy grande (máx 2MB)" }, { status: 413 });

  const bytes = await file.arrayBuffer();
  const asset = await saveMediaAsset(db, { orgId, bytes, mime: file.type || "image/png", kind: "image" });
  await setPaymentMethodQr(db, orgId, id, asset.id);
  return NextResponse.json({ ok: true, id: asset.id });
}
```

- [ ] **Step 2: Acción borrar QR** en `agente/actions.ts`:
```ts
import { setPaymentMethodQr } from "@/lib/agent/payments/methods";

export async function removePaymentQrAction(id: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await setPaymentMethodQr(db, orgId, id, null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/configuracion/agente/pagos");
  return { ok: true };
}
```

- [ ] **Step 3: UI en `_payments.tsx`**

(a) El tipo `items` de `AgentPayments` debe incluir `qrMediaAssetId: string | null` (viene de `listPaymentMethods`). 
(b) En la fila de cada método, añade un mini-dropzone/thumbnail de QR: si `method.qrMediaAssetId`, muestra un thumbnail (`/api/inbox/media/<id>` o `/media/<id>`) con botón quitar (`removePaymentQrAction`); si no, un botón "Subir QR" que abre file picker y hace `fetch(\`/api/agent/payment-methods/${method.id}/qr\`, { method: "POST", body: fd })` + `router.refresh()` + toast. Reusa el patrón de subida del dropzone de documentos (drag opcional; mínimo click). Usa `sonner` toast.

> Nota imagen: el helper de URL pública es `/media/<id>` (ver `publicMediaUrl`) o el endpoint del inbox `/api/inbox/media/<id>`. Verifica cuál sirve la imagen en el panel (productos usa `imageUrl(r)` → revisa `catalog/images.ts` para el patrón correcto y reúsalo).

- [ ] **Step 4: Verificar + commit**

Run: `bunx tsc --noEmit`, `bun run lint`. Commit:
```bash
git add "src/app/api/agent/payment-methods" "src/app/(app)/configuracion/agente/actions.ts" "src/app/(app)/configuracion/agente/_payments.tsx"
git commit -m "feat(payments): QR upload UI + endpoint + clear action"
```

---

## Task 6: El agente envía el QR

**Files:** Modify `src/lib/agent/tools/builtin/medios-de-pago.ts` (+ test). Opción: nuevo tool `enviar_qr_pago`.

**Decisión:** el tool `medios_de_pago` devuelve los datos (incluye `hasQr`); un tool nuevo **`enviar_qr_pago`** envía el QR del método elegido (reusa el patrón de `enviar-foto-producto`: getOrgSettings + phone de la conversación + `uploadMedia` + `sendMedia`). Esto evita spamear QRs al solo listar.

- [ ] **Step 1: medios_de_pago expone hasQr** — en el `.map` del tool añade `hasQr: !!m.qrMediaAssetId` (requiere que `listPaymentMethods` ya traiga la columna; lo hace con `select()` completo). Ajusta el test del tool si verifica el shape.

- [ ] **Step 2: Tool `enviar_qr_pago`** (TDD) en `src/lib/agent/tools/builtin/enviar-qr-pago.ts`:
  - paramsSchema: `{ type?: string; methodId?: string }`.
  - run: lista métodos enabled de la org; resuelve el método por `methodId` o por `type` (o el primero con QR si no se especifica); si no tiene `qrMediaAssetId` → `{ ok:false, error:"Ese medio no tiene QR" }`. Carga bytes del asset local (`getMediaAsset` + `readFile`, igual que enviar-foto-producto), `uploadMedia(settings,...)`, `sendMedia(settings,{ to: phone, kind:"image", mediaId, caption })`. Caption = label del método. Devuelve `{ ok:true, data:{ enviado:true } }`.
  - Test con fakes/seeding como `enviar-foto-producto.test.ts` (revísalo para el patrón de creds `encrypt()` y media).
  - Registrar en `registry.ts` (`enviar_qr_pago`).

- [ ] **Step 3: Verificar + commit**

Run: `bunx vitest run src/lib/agent/tools/ src/lib/agent/payments/` → PASS. Commit:
```bash
git add src/lib/agent/tools src/lib/agent/payments
git commit -m "feat(agent): enviar_qr_pago tool + medios_de_pago exposes hasQr"
```

---

## Task 7: Gauntlet + merge + deploy
- [ ] `bunx vitest run` (todo verde), `bunx tsc --noEmit`, `bun run lint`, `bun run build`.
- [ ] Smoke manual: navegar el sidebar del agente (las 7 sub-páginas cargan), subir un QR a un Nequi, confirmar thumbnail.
- [ ] code-reviewer sobre el diff.
- [ ] Merge a main + `deploy/deploy.sh` (aplica mig 0023).
- [ ] Actualizar memoria.

---

## Self-Review (cobertura)
- ✅ Cada sección su página + layout compartido → Tasks 1–2.
- ✅ Menú lateral propio del agente (grupo colapsable) → Task 3.
- ✅ Productos dentro de Catálogo (decisión) → Task 2.4. Imágenes más visibles = Catálogo es su propia página.
- ✅ QR en medios de pago: schema/upload/UI → Tasks 4–5.
- ✅ El agente envía el QR → Task 6.
- ✅ Gating Premium preservado (layout `requireModuleAccess` + sub-links `module:"agente"`).
