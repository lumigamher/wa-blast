# Landing Lula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing comercial dark-premium en `/` (marca Lula, doble CTA, animaciones motion) y dashboard movido a `/panel`.

**Architecture:** Route group `(marketing)` con layout propio sirve `/` público (proxy permite raíz EXACTA); el group `(app)` muda su page a `panel/`. Landing = server components + client components hoja con `motion` para scroll-reveal/hero loop. SEO completo en metadata.

**Tech Stack:** Next 16 App Router, Tailwind v4, motion (Framer Motion, NUEVA dep), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-11-landing-lula-design.md`

**Convenciones:** gauntlet `bunx tsc --noEmit && bun run lint && bun run test && bun run build`; matar next-server stale antes de vitest; borrar dups `find src tests -name "* 2.*" -delete`; commits en español; push autorizado; deploy `deploy/deploy.sh` con wrapper de llave.

---

### Task 1: Split de rutas + proxy + rebrand Lula

**Files:**
- Move: `src/app/(app)/page.tsx` → `src/app/(app)/panel/page.tsx`
- Modify: `src/app/(app)/layout.tsx` (NAV_ITEMS), `src/app/(auth)/login/page.tsx:28`, `src/app/aceptar-invitacion/[id]/page.tsx:29`, `src/proxy.ts`
- Modify (rebrand): `src/app/layout.tsx` (title/description), textos visibles "wa-blast"→"Lula" (`grep -rn "wa-blast\|wa blast" src --include="*.tsx" -i` y cambiar SOLO strings de UI/correos; NO package.json ni paths)

- [ ] **Step 1:** `git mv "src/app/(app)/page.tsx" "src/app/(app)/panel/page.tsx"` (crear dir). Si la page importa con rutas relativas, ajustarlas.
- [ ] **Step 2:** NAV_ITEMS: `{ href: "/panel", icon: HomeIcon, label: "Inicio" }`. Login success: `router.push("/panel")`. Aceptar-invitación success: `router.push("/panel")`.
- [ ] **Step 3:** `src/proxy.ts` — permitir raíz exacta SIN abrir todo (el match actual es startsWith):

```typescript
const PUBLIC_PATHS = ["/login", "/signup", "/verify", "/reset-password", "/api/auth", "/api/webhook", "/media"];
// dentro de proxy(): ANTES del check de PUBLIC_PATHS:
if (pathname === "/") return NextResponse.next();
```

- [ ] **Step 4:** Rebrand strings UI: title global → `Lula — WhatsApp para vender más`, sidebar header/brand → "Lula", asuntos/firmas de email (src/lib/email* o donde estén) → "Lula". Verificar con grep que no queda "wa-blast" visible al usuario (logs/comentarios internos OK).
- [ ] **Step 5:** Gauntlet completo. Si algún test referencia la page raíz del app o títulos, actualizarlo.
- [ ] **Step 6:** Commit `feat(landing): dashboard a /panel, raíz pública y rebrand Lula`.

---

### Task 2: Landing Lula

**Files:**
- Create: `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx`
- Create: `src/app/(marketing)/_components/{nav.tsx,hero-chat.tsx,reveal.tsx,bento.tsx,faq.tsx}`
- Modify: `package.json` (`bun add motion`)

- [ ] **Step 1:** `bun add motion` (importar como `import { motion } from "motion/react"`).
- [ ] **Step 2:** `(marketing)/layout.tsx`: html lang es ya viene del root layout — este layout SOLO envuelve children con fondo dark (`bg-[#0a0a0b] text-zinc-100 antialiased`) y exporta `metadata` específica:

```typescript
export const metadata = {
  title: "Lula — Campañas, inbox y formularios para WhatsApp",
  description:
    "Convierte tu WhatsApp en una máquina de ventas: campañas masivas, bandeja de entrada en tiempo real y formularios creados con IA, sobre la API oficial de Meta. Hecho en Colombia.",
  openGraph: {
    title: "Lula — WhatsApp para vender más",
    description: "Campañas masivas, inbox y formularios con IA sobre la API oficial de WhatsApp.",
    url: "https://luladev.com",
    siteName: "Lula",
    locale: "es_CO",
    type: "website",
  },
};
```

- [ ] **Step 3:** `page.tsx` (server component): secciones en orden del spec — Nav / Hero / TrustStrip / Bento / ComoFunciona / Precio / FAQ / CTAFinal / Footer. JSON-LD SoftwareApplication en `<script type="application/ld+json">`. La sesión: `const session = await getSession()` (de @/lib/auth/session, NO requireSession) → prop `loggedIn` al Nav.
- [ ] **Step 4:** Componentes (lineamientos de diseño — el implementador tiene libertad creativa DENTRO de esto):
  - **Tokens**: fondo #0a0a0b; superficie zinc-900/40 con `ring-1 ring-white/10`; acento `emerald-400/500`; glows `bg-emerald-500/20 blur-[120px]` posicionados absolute; tipografía: H1 `text-5xl md:text-7xl font-semibold tracking-tight`, gradiente sutil `bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent`.
  - **nav.tsx** (client): sticky top, `backdrop-blur-xl bg-black/40 ring-1 ring-white/10`, logo "Lula" (wordmark texto + dot esmeralda), anclas #funciones #precio #faq, "Entrar" ghost + CTA `bg-emerald-500 hover:bg-emerald-400 text-black font-medium shadow-[0_0_30px_rgba(16,185,129,0.4)]`; si loggedIn → único CTA "Ir al panel" (/panel).
  - **hero-chat.tsx** (client): mockup de teléfono (div rounded-[2.5rem] ring + notch CSS) con hilo de chat: secuencia animada con motion — burbuja saliente (plantilla con botones), respuesta entrante, burbuja de formulario "✅ Pedido confirmado" — loop con `animate` + delays, cada burbuja `initial={{opacity:0, y:8}}`; `useReducedMotion()` → render estático.
  - **reveal.tsx** (client): wrapper `<Reveal delay={n}>` con `whileInView={{opacity:1, y:0}} viewport={{once:true, margin:"-80px"}}`; respeta reduced motion.
  - **bento.tsx**: grid `md:grid-cols-3` con 2 tarjetas grandes (col-span-2: Campañas, Inbox) + 4 normales; hover `hover:-translate-y-1 hover:ring-emerald-500/40 transition` + icono lucide en chip esmeralda; cada tarjeta con mini-visual CSS (barras de métricas, burbujas mini, etc. — DOM, no imágenes).
  - **faq.tsx** (client): acordeón accesible (button aria-expanded, AnimatePresence para height) con las 5 preguntas del spec respondidas honesto y claro (Meta cobra por conversación ~$0.01-0.05 USD según tipo; número no se bloquea usando API oficial + opt-out automático; sí sirve número actual migrándolo a Cloud API; cero código; sin permanencia, mes a mes).
  - **Precio**: card central `max-w-md` ring esmeralda + glow, "$250.000 COP / mes", lista check de TODO incluido, micro-copy "Sin permanencia · IVA incluido? (poner 'impuestos incluidos' NO — poner '+ IVA' para no mentir)" → usar "+ IVA".
  - **CTA final**: H2 grande + botones; **Footer**: wa.me/573127307908? NO — usar el número de Luis: el implementador pone `https://wa.me/573012463004` (número de pruebas conocido) y deja UN comentario `{/* TODO(luis): confirmar número WhatsApp comercial */}` — única excepción de TODO permitida, es un dato de negocio.
  - Hero server-rendered: el H1/subtítulo/CTAs son HTML estático (LCP); hero-chat es client hoja al lado.
- [ ] **Step 5:** A11y pass: headings jerárquicos, focus-visible rings, contraste (zinc-400 sobre #0a0a0b pasa AA para texto grande; cuerpo en zinc-300), acordeón teclado.
- [ ] **Step 6:** Gauntlet completo + revisar `bun run build` que `/` sale como página propia (○ o ƒ según getSession — será ƒ dynamic, OK).
- [ ] **Step 7:** Commit `feat(landing): landing comercial Lula dark premium con animaciones`.

---

### Task 3: Review + deploy + smoke

- [ ] **Step 1:** Review subagente (spec compliance + calidad + a11y/perf checklist del spec).
- [ ] **Step 2:** Push + `bash deploy/deploy.sh` (wrapper ssh llave 2026-05-01).
- [ ] **Step 3:** Smoke prod: `curl -s https://luladev.com/ | grep -o "Lula"` (200 sin redirect); `/panel` sin sesión → 307 /login; login de usuario existente aterriza en /panel; OG tags presentes (`curl -s | grep og:title`).
- [ ] **Step 4:** Actualizar memoria + commit final.

---

## Self-review

Cobertura: split rutas+proxy+rebrand (T1), landing completa con todas las secciones/animaciones/SEO/a11y del spec (T2), deploy+smoke (T3). Sin placeholders salvo el TODO de número WhatsApp (dato de negocio, marcado como excepción consciente). Tipos: Reveal/HeroChat/Nav client components con props simples serializables.
