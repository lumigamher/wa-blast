# Plan: 3 planes por módulos + upgrades

## Decisiones (Luis, 2026-06-19)

- **Gating por módulos** (cada plan desbloquea más features).
- **Reparto**:
  - **Esencial** `$49.997/mes`: Campañas, Inbox, Plantillas, Contactos
  - **Pro** `$70.997/mes`: + Flows IA, Carrusel
  - **Premium** `$99.997/mes`: + Llamadas
- **Upgrade**: inmediato con prorrateo vía EfiPay (cobra la diferencia por días restantes; el acceso sube al instante al confirmar pago).
- Color principal ya migrado a esmeralda; emojis decorativos ya removidos (palette de reacciones y flags de idioma se conservan).

## Módulos gateables

`campanas | inbox | plantillas | contactos | flows | carrusel | llamadas`
Core siempre disponible: panel, salud, facturacion, configuracion, admin (superadmin).

Rutas por módulo:
- campanas → `/campanas`, `/campanas/nueva`
- inbox → `/inbox`
- plantillas → `/plantillas`
- contactos → `/contactos`, `/contactos/tags`
- flows → `/flows`
- llamadas → `/llamadas`
- carrusel → opción dentro del wizard de campaña (gate por feature, no por ruta)

## Fuente de verdad de precios

`appConfig` keys `plan_price_esencial | plan_price_pro | plan_price_premium`
(defaults 49997/70997/99997). Editable desde **/admin**. La landing (server component)
lee de la misma fuente → sincronizado. El mapeo módulos↔plan vive en código (`plans.ts`).

## Fases

### A · Fundación (datos + catálogo)
- Schema sqlite:
  - `subscriptions.planId` enum esencial|pro|premium, default 'esencial'
  - `billingCheckouts`: `+planId`, `+kind` (subscription|upgrade), `+amountCop`
- `src/lib/billing/plans.ts`: PlanId/ModuleId, PLANS (name, priceCop default, modules[], order), helpers planRank/planHasModule/modulesForPlan, MODULE_LABELS, MODULE_ROUTES.
- `src/lib/billing/config.ts`: getPlanPrices(db)/setPlanPrice(db,id,v) + getPlanCatalog(db) (merge precios de appConfig sobre defaults).
- `src/lib/billing/access.ts`: getOrgAccess(db,orgId) → {active, planId, modules:Set}; checkModuleGate.
- `db:generate` migración. Tests unitarios plans/access/proration.

### B · Gating
- Nav (layout): pasar módulos del org; bloquear ítems fuera del plan (candado + link a /facturacion).
- Guard `requireModule(module)` en cada page de módulo gateado → redirect /facturacion?upgrade=<module>.
- Carrusel: ocultar/bloquear opción en wizard si plan < pro.

### C · Flujo de cobro
- `applyCharge` acepta `planId` → lo set en subscriptions.
- subscribe action toma planId (default esencial / elegido en /facturacion).
- upgrade action: prorrateo = round((target-actual) * díasRestantes/30); checkout kind=upgrade.
- webhook: si kind=upgrade → solo set planId (sin extender período); si no → applyCharge con planId.

### D · Landing
- Quitar sección **simulador** (`campaign-demo.tsx`) + borrar componente + import.
- Pricing: 3 cards desde getPlanCatalog (resalta Pro). Check icons por módulo.
- JSON-LD: 3 offers.

### E · Admin precios + Perfil upgrade
- /admin: editar los 3 precios.
- /facturacion: plan actual + opciones de subir (muestra diff prorrateado) → upgrade action.

## Verificación
`bun run typecheck && bun run test && bunx biome check src/`
