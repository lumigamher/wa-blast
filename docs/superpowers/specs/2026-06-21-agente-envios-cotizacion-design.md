# Spec: Agente IA — Envíos / cotización nacional (multi-transportadora)

**Fecha:** 2026-06-21
**Estado:** diseño aprobado — pendiente escribir plan + construir.
**Sub-proyecto:** capacidad que se enchufa al motor del Agente IA (ver `project_wa_blast_agente_ia`).

## Contexto

El agente ya vende a nivel nacional (catálogo, variantes, pedidos, pagos, fotos, RAG). Falta el **envío**: "no hay venta completa sin envío". Para cotizar un envío real se necesita **origen + destino (ciudad/código) + peso + dimensiones (L×W×H) + valor declarado**, y los productos/variantes **hoy no tienen peso ni dimensiones**. Las transportadoras colombianas (Servientrega, Interrapidísimo, Envía, Coordinadora, TCC) se pueden cotizar de forma unificada con **agregadores con API** (Mipaquete, Skydropx, DrEnvío, Envíame): registro y **cotización gratis**, solo se paga el flete al generar guía.

## Objetivo / No-objetivo

**Objetivo (v1):** que el agente, con un pedido armado, pida la **ciudad de destino**, calcule el **paquete** (peso + volumen sumando las unidades) y **cotice** con el proveedor de envíos configurado por la org, ofreciendo al cliente **la opción más barata + la más rápida** (transportadora, precio, días). Cargar peso/dimensiones en producto/variante. Configurar el proveedor de envíos como una **integración por org** (el cliente conecta su propia cuenta) + un **fallback de tabla manual**.

**No-objetivo (v1):** generar la guía/rótulo, tracking, bin-packing real (optimización de empaque), reglas de envío gratis / markup / recaudo contra-entrega. Todo fast-follow.

## Decisiones (confirmadas con Luis 2026-06-21)

1. **Alcance = solo cotizar y ofrecer.** La guía la genera la operación de la org. Costo $0 (la API de cotización es gratis).
2. **Envíos como integración por org** (mismo patrón que `integrations/calendar` y `integrations/catalog`): cada cliente conecta su propio servicio, credenciales cifradas. Default recomendado **Mipaquete** (Colombia-native, API v2); Skydropx/Envíame/DrEnvío enchufables después.
3. **Fallback "tabla manual"**: tarifas por zona/peso que la org carga en el panel. Cero dependencia externa; permite construir/testear sin credenciales y operar sin agregador.
4. **El agente ofrece la más barata + la más rápida** (2 opciones) cuando hay varias.
5. **Peso y dimensiones en producto Y variante**; la variante **sobreescribe** al producto si los trae.
6. **Peso facturable = max(peso real, peso volumétrico)**, volumétrico = `L×W×H(cm) / factor` (factor configurable por org, Colombia ≈ 2500).

## Arquitectura

```
Pedido armado → cotizar_envio(ciudadDestino)
  → computePackage(items[]) (peso real + volumétrico → paquete)
  → ShippingProvider.quote({ origen, destino, paquete, valorDeclarado })
  → CarrierQuote[] (transportadora, servicio, precioCop, díasEntrega)
  → el agente ofrece la más barata + la más rápida
```

### Modelo de datos
- `products` y `product_variants`: nuevos campos `weight_grams`, `length_cm`, `width_cm`, `height_cm` (integer, nullable). La variante sobreescribe al producto cuando trae valor.
- `agent_shipping` (nueva tabla, mig nueva, una por org): `orgId` PK, `provider` (enum `["mipaquete","manual"]`, extensible), `credentials_enc` (JSON cifrado: p.ej. `{ apiKey }`), `config_json` (no secreto: `{ originCityCode, originCityName, volumetricFactor }`), `updatedAt`. Mismo patrón exacto que `agent_catalog`/`agent_calendar`.
- Fallback manual: tabla `shipping_rates` (orgId, zona/ciudad o "default", maxWeightKg, priceCop, díasEntrega) o un JSON en `agent_shipping.config_json`. **Decisión de implementación:** empezar con un JSON de reglas en `config_json` (simple); promover a tabla si crece.

### Módulos (siguiendo `src/lib/agent/integrations/`)
- `src/lib/agent/integrations/shipping/types.ts` — `Package`, `ShippingQuoteInput`, `CarrierQuote`, `ShippingProvider { quote(input) → CarrierQuote[] }`.
- `src/lib/agent/integrations/shipping/config.ts` — `getShippingConfig`/`saveShippingConfig` (cifra credenciales con `crypto/encrypt`, igual que catalog/calendar).
- `src/lib/agent/integrations/shipping/index.ts` — `getShippingProvider({ provider, credentials, config })` (switch como catalog).
- `src/lib/agent/integrations/shipping/mipaquete.ts` — impl Mipaquete: auth Bearer JWT (api key), endpoint de cotización (origen/destino por código de ciudad + peso + dims + valor), mapea respuesta a `CarrierQuote[]`; resolución ciudad→código vía catálogo de ciudades de Mipaquete (cachear). **Verificar shapes exactos contra la doc (api.documentacion.mipaquete.com) durante el plan/Context7.**
- `src/lib/agent/integrations/shipping/manual.ts` — impl tabla manual: resuelve precio/días por zona+peso desde la config.
- `src/lib/agent/shipping/package.ts` — `computePackage(items, { volumetricFactor })` **función pura**: `items` = `[{ weightGrams, lengthCm, widthCm, heightCm, quantity }]` → `{ pesoRealKg, pesoVolumetricoKg, pesoFacturableKg, dims }`. Falla/avisa si a algún item le falta peso o dimensiones.
- `src/lib/agent/tools/builtin/cotizar-envio.ts` — tool `cotizar_envio`. Params: `{ ciudadDestino: string, valorDeclaradoCop?: number }`. Carga items del pedido en curso (o del contexto), `computePackage`, `getShippingProvider`, `provider.quote`. Devuelve la más barata + la más rápida (o las dos si coinciden). Si falta peso/dims en algún producto → `{ ok:false, error:"Falta el peso/dimensiones de <producto>" }` (no inventa). Registrar en `registry.ts`.

### Panel
- Nueva sección **"Envíos"** en el menú lateral del agente (`/configuracion/agente/envios`, encaja con el panel ya separado por secciones): elegir provider (Mipaquete / Tabla manual), credenciales (api key Mipaquete), **ciudad de origen**, factor volumétrico, y —si manual— la tabla de tarifas por zona/peso. Mismo estilo que la sección Calendario/Catálogo.
- Editor de producto/variante (`_product-detail.tsx`): campos peso (g) y dimensiones (cm).
- Sub-link "Envíos" en el grupo "Agente IA" del sidebar.

## Determinismo / seguridad / costo
- `computePackage` puro y testeable (sin red).
- Credenciales (api key Mipaquete) **cifradas** por org (`crypto/encrypt`), nunca en código/git/.env compartido. La key que Luis compartió se usa solo para validar la integración en build (local), no se commitea.
- Multi-tenant: config y tarifas por `orgId`; el tool lee solo la config de su org.
- Cotización = gratis (no genera guía). Sin costo por consulta. Resolución ciudad→código cacheada para no golpear el catálogo en cada turno.
- Resiliencia: si el provider falla/timeout, el tool devuelve error claro (el agente lo comunica o escala), no rompe el turno.

## Testing
- `computePackage` puro: 1 unidad, varias unidades, variante sin dims (hereda del producto), peso volumétrico > real, item sin peso → error.
- `manual` provider: resuelve por zona/peso, default, fuera de cobertura.
- `mipaquete` provider: con `fetch` mockeado (mapeo de respuesta → `CarrierQuote[]`, auth header, manejo de error HTTP). Sin red real en tests.
- `getShippingProvider` switch + `config` cifrado/descifrado.
- `cotizar_envio` tool: feliz (ofrece barata+rápida), falta peso/dims, provider no configurado, destino sin cobertura.

## Plan de fases (para writing-plans)
1. Data: columnas peso/dims en products+variants + tabla `agent_shipping` (migración) + `computePackage` puro.
2. Abstracción `ShippingProvider` + `manual` (tabla) + config cifrada.
3. `mipaquete` provider (verificar endpoints reales) + city resolver.
4. Tool `cotizar_envio` + registro + integración con el pedido.
5. Panel: sección "Envíos" + campos peso/dims en producto/variante + sub-link sidebar.
6. Gauntlet + review + merge + deploy.

## Riesgos / a verificar en el plan
- **Shapes exactos de la API de Mipaquete** (endpoint de cotización, nombres de campos, formato de código de ciudad/DANE, auth) — verificar contra `api.documentacion.mipaquete.com` (JS-rendered) o Context7 al construir la fase 3. La abstracción aísla este riesgo: el resto (datos, packing, tool, panel, manual) no depende de Mipaquete.
- Resolución ciudad→código: Mipaquete expone catálogo de ciudades; definir cache/almacenamiento.
- Origen: la ciudad de origen es de la org (config), no del producto.
