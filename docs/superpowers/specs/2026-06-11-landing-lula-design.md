# Lula — Landing comercial en luladev.com (diseño)

**Fecha:** 2026-06-11 · **Estado:** aprobado por Luis ("dale de one")
**Decisiones de Luis:** marca **Lula**, estilo **dark premium** (Linear/Resend vibe, acento
esmeralda/WhatsApp), funnel **doble CTA** (registro self-service + WhatsApp directo).

## Objetivo

`luladev.com/` pasa de redirect-a-login a una landing que vende sola: diseño premium con
animaciones pulidas (NO AI-looking), funnel a "Crear cuenta gratis" (signup existente) y
a WhatsApp (wa.me). El dashboard se muda a `/panel`.

## Estructura de la página (orden = funnel)

1. **Navbar** sticky glass (blur): logo Lula, anclas Funciones/Precio/FAQ, "Entrar"
   (/login) + CTA primario "Crear cuenta gratis" (/signup) con glow esmeralda. Con
   sesión activa: el CTA cambia a "Ir al panel".
2. **Hero**: H1 gancho ("Tu WhatsApp, convertido en máquina de ventas" o mejor copy),
   subtítulo concreto (campañas masivas + inbox + formularios con IA, sobre la **API
   oficial de WhatsApp Cloud de Meta**), doble CTA. Visual: **mockup de chat en
   CSS/DOM** (sin imágenes) con burbujas que aparecen en secuencia loop: plantilla de
   campaña → respuesta del cliente → formulario completado. Fondo: dark profundo
   (#0a0a0b aprox) con radial glow esmeralda + grid sutil.
3. **Strip de confianza**: API oficial Meta · Hecho en Colombia 🇨🇴 · Sin permanencia.
4. **Bento grid** 6 features (hover lift + borde luminoso): Campañas masivas con
   carrusel · Inbox en tiempo real · Formularios con IA (diferenciador estrella) ·
   Plantillas con preview en vivo · Contactos/tags/opt-out automático · Métricas de
   entrega y lectura.
5. **Cómo funciona** 3 pasos con scroll-reveal: Crea tu cuenta → Conecta tu WhatsApp
   (te acompañamos) → Lanza tu primera campaña.
6. **Precio**: card única — $250.000 COP/mes todo incluido, sin tiers ni letra menuda,
   bullets, CTA. (Hardcoded en la landing; si Luis cambia el precio en /admin se
   actualiza el copy a mano — la landing es estática para LCP.)
7. **FAQ acordeón** (5): bloqueo del número, costo por mensaje de Meta, usar número
   actual, sin conocimientos técnicos, sin permanencia.
8. **CTA final** + footer: wa.me de Luis, "Entrar", copyright Lula, luladev.com.

## Animaciones

Librería: `motion` (Framer Motion, nueva dependencia). Scroll-reveal con stagger
(whileInView, once), secuencia de burbujas del hero (loop con delays), hover en bento
(lift + glow), acordeón animado. **`prefers-reduced-motion` respetado** (variants a
opacity-only). Sin GSAP en v1 (YAGNI — no hay scroll-scrubbing complejo).

## Performance y a11y (innegociables)

- LCP < 2.5s: hero server-rendered, texto LCP element, cero imágenes hero (todo
  CSS/DOM), `motion` solo en client components hoja, fuentes del sistema o next/font.
- CLS < 0.1 (alturas reservadas), INP < 200ms.
- WCAG 2.2 AA: contraste en dark verificado, navegación por teclado en acordeón/nav,
  focus visible, headings jerárquicos, aria en acordeón.

## Cambio estructural de rutas

- Dashboard actual `src/app/(app)/page.tsx` → `src/app/(app)/panel/page.tsx`.
- NAV_ITEMS "Inicio" href "/" → "/panel". Todo redirect interno a "/" (login success,
  aceptar-invitación, retorno, links) → "/panel". Better Auth callbacks revisados.
- Landing en `src/app/(marketing)/page.tsx` + layout propio (sin sidebar).
- `src/proxy.ts`: "/" exacto pasa público (cuidado: el match actual es por prefijo —
  "/" como prefijo abriría TODO; debe ser comparación exacta para la raíz).
- SEO: metadata completa (title "Lula — Campañas, inbox y formularios para WhatsApp"),
  OG tags, JSON-LD SoftwareApplication, robots ok. Sitemap simple.

## Rebrand ligero del app

Title global, sidebar y correos: "wa-blast" → "Lula" (textos visibles; el repo/paquete
sigue llamándose wa-blast).

## Pruebas

Las existentes siguen verdes (rutas movidas: cualquier test que referencie "/" del app
se actualiza a /panel). Build OK. Lighthouse mental-check vía decisiones de diseño (no
hay CI de Lighthouse en v1). Verificación manual en prod post-deploy.

## Fuera de alcance

Blog/contenido SEO, testimonios (no hay clientes aún), A/B testing, analytics
(plausible/GA se puede añadir luego), página de precios separada, i18n.
