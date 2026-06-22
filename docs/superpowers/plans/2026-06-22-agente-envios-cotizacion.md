# Agente IA — Envíos / cotización nacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente, con un pedido armado, pide la ciudad de destino (texto o ubicación de WhatsApp), arma el paquete (peso+volumen), cotiza con el proveedor de envíos de la org (Mipaquete o tabla manual), ofrece la opción más barata + la más rápida, y guarda la dirección de despacho en el pedido.

**Architecture:** Integración modular por org (`src/lib/agent/integrations/shipping/`, mismo patrón que catalog/calendar): abstracción `ShippingProvider` con `manual` (tabla de tarifas) y `mipaquete` (API), config cifrada en `agent_shipping`. `computePackage` puro. Tools `cotizar_envio` + `guardar_direccion_envio`. Peso/dimensiones en products+variants; dirección/quote en `orders`. Parse de mensajes `location`. Panel: sección "Envíos".

**Tech Stack:** Next.js 16, Drizzle + better-sqlite3, Zod, crypto/encrypt, Vitest. Mipaquete REST (auth Bearer JWT).

**Decisiones (spec 2026-06-21):** v1 = solo cotizar+ofrecer (barata+rápida); integración por org (Mipaquete default + manual fallback); peso facturable = max(real, volumétrico = L×W×H/factor, factor≈2500); ubicación WA = parsear + confirmar ciudad (sin geocoder); dirección de despacho estructurada en el pedido. No-objetivo: guía/tracking, geocoding automático, bin-packing, stock.

---

## File Structure
- `src/lib/db/schema/domain.ts` (MOD): columnas peso/dims en `products`+`productVariants`; `shippingAddressJson`/`shippingQuoteJson` en `orders`; tabla `agentShipping`. → migración 0024.
- `src/lib/agent/shipping/package.ts` (NEW): `computePackage` puro.
- `src/lib/agent/integrations/shipping/{types,config,index,manual,mipaquete}.ts` (NEW): abstracción + impls + config cifrada.
- `src/lib/agent/catalog/orders.ts` (MOD): `getLatestOrderForConversation`, `setOrderShipping`.
- `src/lib/agent/tools/builtin/{cotizar-envio,guardar-direccion-envio}.ts` (NEW) + registrar en `registry.ts`.
- `src/lib/inbox/parse-inbound.ts` (MOD): rama `location`.
- `src/lib/agent/admin.ts` (MOD): `saveShipping` (config del panel) + peso/dims en `addProduct`/upsert (opcional v1: solo via XLSX/editor).
- `src/app/(app)/configuracion/agente/envios/page.tsx` + `_shipping.tsx` (NEW): sección panel. `src/app/(app)/layout.tsx` (MOD): sub-link "Envíos".

---

## Task 1: Schema + migración (peso/dims, agent_shipping, orders shipping)

**Files:** Modify `src/lib/db/schema/domain.ts`; generate migration.

- [ ] **Step 1: Añadir columnas y tabla**

En `products` (añade tras `available`):
```ts
    weightGrams: integer("weight_grams"),
    lengthCm: integer("length_cm"),
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),
```
Igual en `productVariants` (tras `available`): las mismas 4 columnas.
En `orders` (tras `comprobanteMediaId`):
```ts
    shippingAddressJson: text("shipping_address_json"),
    shippingQuoteJson: text("shipping_quote_json"),
```
Nueva tabla (junto a `agentCatalog`):
```ts
export const agentShipping = sqliteTable("agent_shipping", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["mipaquete", "manual"] })
    .notNull()
    .default("manual"),
  credentialsEnc: text("credentials_enc"),
  configJson: text("config_json").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

- [ ] **Step 2: Generar migración**

Run: `bun run db:generate` → `drizzle/migrations/0024_*.sql` con los `ALTER TABLE` + `CREATE TABLE agent_shipping`. Verifica el SQL. (Si iCloud dejó `* 2.sql`, ignóralos.)

- [ ] **Step 3: Verificar que migra**

Run: `bunx vitest run src/lib/agent/context.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/domain.ts drizzle/migrations
git commit -m "feat(shipping): schema peso/dims + agent_shipping + orders shipping"
```

---

## Task 2: computePackage (puro)

**Files:** Create `src/lib/agent/shipping/package.ts`; Test `src/lib/agent/shipping/package.test.ts`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { computePackage } from "./package";

describe("computePackage", () => {
  it("una unidad: peso real y volumétrico", () => {
    // 1000g, 20x20x10 = 4000cm3 → vol/2500 = 1.6kg → facturable max(1, 1.6)=1.6
    const p = computePackage([{ weightGrams: 1000, lengthCm: 20, widthCm: 20, heightCm: 10, quantity: 1 }]);
    expect(p.pesoRealKg).toBeCloseTo(1, 5);
    expect(p.pesoVolumetricoKg).toBeCloseTo(1.6, 5);
    expect(p.pesoFacturableKg).toBeCloseTo(1.6, 5);
  });
  it("varias unidades suma peso y volumen", () => {
    const p = computePackage([{ weightGrams: 500, lengthCm: 10, widthCm: 10, heightCm: 10, quantity: 3 }]);
    expect(p.pesoRealKg).toBeCloseTo(1.5, 5); // 500*3/1000
    // volumen total = 1000*3 = 3000 → /2500 = 1.2
    expect(p.pesoVolumetricoKg).toBeCloseTo(1.2, 5);
    expect(p.pesoFacturableKg).toBeCloseTo(1.5, 5);
  });
  it("factor configurable", () => {
    const p = computePackage([{ weightGrams: 100, lengthCm: 10, widthCm: 10, heightCm: 10, quantity: 1 }], { volumetricFactor: 5000 });
    expect(p.pesoVolumetricoKg).toBeCloseTo(0.2, 5); // 1000/5000
  });
  it("lanza si falta peso o dimensión", () => {
    expect(() => computePackage([{ weightGrams: null, lengthCm: 10, widthCm: 10, heightCm: 10, quantity: 1 }])).toThrow(/peso|dimension/i);
    expect(() => computePackage([{ weightGrams: 100, lengthCm: null, widthCm: 10, heightCm: 10, quantity: 1 }])).toThrow(/dimension/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/shipping/package.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Create `src/lib/agent/shipping/package.ts`:
```ts
export type PackageItem = {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  quantity: number;
};

export type ComputedPackage = {
  pesoRealKg: number;
  pesoVolumetricoKg: number;
  pesoFacturableKg: number;
  dims: { lengthCm: number; widthCm: number; heightCm: number };
};

const DEFAULT_FACTOR = 2500;

export function computePackage(
  items: PackageItem[],
  opts: { volumetricFactor?: number } = {},
): ComputedPackage {
  const factor = opts.volumetricFactor ?? DEFAULT_FACTOR;
  let totalGrams = 0;
  let totalVolumeCm3 = 0;
  for (const it of items) {
    if (it.weightGrams == null) throw new Error("Falta el peso de un producto");
    if (it.lengthCm == null || it.widthCm == null || it.heightCm == null) {
      throw new Error("Faltan las dimensiones de un producto");
    }
    const qty = it.quantity;
    totalGrams += it.weightGrams * qty;
    totalVolumeCm3 += it.lengthCm * it.widthCm * it.heightCm * qty;
  }
  const pesoRealKg = totalGrams / 1000;
  const pesoVolumetricoKg = totalVolumeCm3 / factor;
  const side = Math.cbrt(totalVolumeCm3);
  return {
    pesoRealKg,
    pesoVolumetricoKg,
    pesoFacturableKg: Math.max(pesoRealKg, pesoVolumetricoKg),
    dims: {
      lengthCm: Math.round(side),
      widthCm: Math.round(side),
      heightCm: Math.round(side),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/shipping/package.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/shipping/package.ts src/lib/agent/shipping/package.test.ts
git commit -m "feat(shipping): computePackage (peso real/volumétrico/facturable)"
```

---

## Task 3: ShippingProvider types + manual provider

**Files:** Create `src/lib/agent/integrations/shipping/types.ts`, `manual.ts`; Test `manual.test.ts`.

- [ ] **Step 1: Tipos**

Create `src/lib/agent/integrations/shipping/types.ts`:
```ts
export type ShippingPackage = {
  pesoFacturableKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type ShippingQuoteInput = {
  originCityName: string;
  originCityCode?: string;
  destinationCityName: string;
  pkg: ShippingPackage;
  declaredValueCop: number;
};

export type CarrierQuote = {
  carrier: string;
  service: string;
  priceCop: number;
  deliveryDays: number | null;
};

export interface ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<CarrierQuote[]>;
}

/** Config del provider manual: tarifas por destino/peso. */
export type ManualRate = {
  city?: string; // si se omite, aplica como "default"
  maxWeightKg: number;
  priceCop: number;
  deliveryDays?: number;
};
export type ManualShippingConfig = { rates: ManualRate[] };
```

- [ ] **Step 2: Test del manual provider**

Create `src/lib/agent/integrations/shipping/manual.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeManualShipping } from "./manual";

const cfg = {
  rates: [
    { city: "Bogotá", maxWeightKg: 1, priceCop: 8000, deliveryDays: 2 },
    { city: "Bogotá", maxWeightKg: 5, priceCop: 12000, deliveryDays: 2 },
    { maxWeightKg: 1, priceCop: 10000, deliveryDays: 4 }, // default
    { maxWeightKg: 5, priceCop: 16000, deliveryDays: 4 },
  ],
};

describe("makeManualShipping", () => {
  it("elige la tarifa por ciudad y peso (primer tier que cubre el peso)", async () => {
    const p = makeManualShipping(cfg);
    const q = await p.quote({
      originCityName: "Medellín", destinationCityName: "Bogotá",
      pkg: { pesoFacturableKg: 0.5, lengthCm: 10, widthCm: 10, heightCm: 10 }, declaredValueCop: 50000,
    });
    expect(q[0].priceCop).toBe(8000);
    expect(q[0].deliveryDays).toBe(2);
  });
  it("usa default cuando la ciudad no tiene tarifa", async () => {
    const p = makeManualShipping(cfg);
    const q = await p.quote({
      originCityName: "Medellín", destinationCityName: "Leticia",
      pkg: { pesoFacturableKg: 3, lengthCm: 10, widthCm: 10, heightCm: 10 }, declaredValueCop: 1,
    });
    expect(q[0].priceCop).toBe(16000);
  });
  it("sin cobertura para el peso → []", async () => {
    const p = makeManualShipping({ rates: [{ maxWeightKg: 1, priceCop: 1000 }] });
    const q = await p.quote({
      originCityName: "X", destinationCityName: "Y",
      pkg: { pesoFacturableKg: 10, lengthCm: 1, widthCm: 1, heightCm: 1 }, declaredValueCop: 1,
    });
    expect(q).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/integrations/shipping/manual.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar manual**

Create `src/lib/agent/integrations/shipping/manual.ts`:
```ts
import type { CarrierQuote, ManualShippingConfig, ShippingProvider, ShippingQuoteInput } from "./types";

export function makeManualShipping(config: ManualShippingConfig): ShippingProvider {
  return {
    async quote(input: ShippingQuoteInput): Promise<CarrierQuote[]> {
      const dest = input.destinationCityName.trim().toLowerCase();
      const cityRates = config.rates
        .filter((r) => r.city && r.city.trim().toLowerCase() === dest)
        .sort((a, b) => a.maxWeightKg - b.maxWeightKg);
      const defaultRates = config.rates
        .filter((r) => !r.city)
        .sort((a, b) => a.maxWeightKg - b.maxWeightKg);
      const pool = cityRates.length > 0 ? cityRates : defaultRates;
      const match = pool.find((r) => input.pkg.pesoFacturableKg <= r.maxWeightKg);
      if (!match) return [];
      return [
        {
          carrier: "Tabla manual",
          service: `Hasta ${match.maxWeightKg} kg`,
          priceCop: match.priceCop,
          deliveryDays: match.deliveryDays ?? null,
        },
      ];
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/integrations/shipping/manual.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/integrations/shipping/types.ts src/lib/agent/integrations/shipping/manual.ts src/lib/agent/integrations/shipping/manual.test.ts
git commit -m "feat(shipping): ShippingProvider types + manual rate-table provider"
```

---

## Task 4: Config cifrada (getShippingConfig/saveShippingConfig) + index switch

**Files:** Create `src/lib/agent/integrations/shipping/config.ts`, `index.ts`; Test `config.test.ts`.

- [ ] **Step 1: Test config (espejo de catalog/config)**

Create `src/lib/agent/integrations/shipping/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization } from "@/lib/db/schema";
import { getShippingConfig, saveShippingConfig } from "./config";

describe("shipping config", () => {
  it("guarda y lee config con credenciales cifradas", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await saveShippingConfig(db, "o1", {
      provider: "mipaquete",
      credentials: { apiKey: "secreto-123" },
      config: { originCityName: "Medellín", volumetricFactor: 2500 },
    });
    const cfg = await getShippingConfig(db, "o1");
    expect(cfg?.provider).toBe("mipaquete");
    expect(cfg?.credentials.apiKey).toBe("secreto-123");
    expect(cfg?.config.originCityName).toBe("Medellín");
  });
  it("org sin config → null", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    expect(await getShippingConfig(db, "o1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/integrations/shipping/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar config (copia el patrón de `integrations/catalog/config.ts`)**

Create `src/lib/agent/integrations/shipping/config.ts`:
```ts
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";
import type { DB } from "@/lib/db/client";
import { agentShipping } from "@/lib/db/schema";

export type ShippingConfig = {
  provider: "mipaquete" | "manual";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export async function saveShippingConfig(db: DB, orgId: string, input: ShippingConfig): Promise<void> {
  const now = new Date();
  const hasCreds = Object.keys(input.credentials).length > 0;
  const credentialsEnc = hasCreds ? encrypt(JSON.stringify(input.credentials)) : null;
  const configJson = JSON.stringify(input.config ?? {});
  await db
    .insert(agentShipping)
    .values({ orgId, provider: input.provider, credentialsEnc, configJson, updatedAt: now })
    .onConflictDoUpdate({
      target: agentShipping.orgId,
      set: { provider: input.provider, credentialsEnc, configJson, updatedAt: now },
    });
}

export async function getShippingConfig(db: DB, orgId: string): Promise<ShippingConfig | null> {
  const row = (await db.select().from(agentShipping).where(eq(agentShipping.orgId, orgId)))[0];
  if (!row) return null;
  let credentials: Record<string, string> = {};
  if (row.credentialsEnc) {
    try { credentials = JSON.parse(decrypt(row.credentialsEnc)); } catch { credentials = {}; }
  }
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.configJson); } catch { config = {}; }
  return { provider: row.provider, credentials, config };
}
```

- [ ] **Step 4: Implementar index (switch)**

Create `src/lib/agent/integrations/shipping/index.ts`:
```ts
import { makeManualShipping } from "./manual";
import { makeMipaqueteShipping } from "./mipaquete";
import type { ManualShippingConfig, ShippingProvider } from "./types";

export type ShippingResolveInput = {
  provider: "mipaquete" | "manual";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export function getShippingProvider(input: ShippingResolveInput): ShippingProvider {
  if (input.provider === "mipaquete") {
    return makeMipaqueteShipping({
      apiKey: input.credentials.apiKey ?? "",
      originCityCode: String(input.config.originCityCode ?? ""),
    });
  }
  const rates = (input.config.rates as ManualShippingConfig["rates"]) ?? [];
  return makeManualShipping({ rates });
}
```
> Nota: `makeMipaqueteShipping` se crea en Task 6; hasta entonces este import romperá la compilación. Implementa Task 6 antes de compilar el index, o crea un stub temporal `export function makeMipaqueteShipping(_: { apiKey: string; originCityCode: string }): ShippingProvider { return { async quote() { return []; } }; }` en `mipaquete.ts` y reemplázalo en Task 6. **Decisión: crea el stub ahora** para que config+index compilen y testeen, y Task 6 lo reemplaza.

- [ ] **Step 5: Run test + tsc**

Run: `bunx vitest run src/lib/agent/integrations/shipping/config.test.ts` y `bunx tsc --noEmit`
Expected: PASS / sin errores (con el stub de mipaquete).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/integrations/shipping/config.ts src/lib/agent/integrations/shipping/index.ts src/lib/agent/integrations/shipping/config.test.ts src/lib/agent/integrations/shipping/mipaquete.ts
git commit -m "feat(shipping): encrypted config + provider switch (+ mipaquete stub)"
```

---

## Task 5: orders — getLatestOrderForConversation + setOrderShipping

**Files:** Modify `src/lib/agent/catalog/orders.ts`; Test `src/lib/agent/catalog/orders.test.ts`.

- [ ] **Step 1: Test**

Añade a `orders.test.ts` (reusa su seed; crea un pedido con `createOrder` usando un provider falso o inserta en `orders` directo):
```ts
import { getLatestOrderForConversation, setOrderShipping } from "./orders";
import { orders, organization, conversations } from "@/lib/db/schema";

describe("orders shipping helpers", () => {
  it("recupera el último pedido de la conversación y guarda envío", async () => {
    const { db } = makeTestDb();
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", conversationId: "c1", itemsJson: "[]", totalCop: 1000, createdAt: new Date(Date.now() - 1000) });
    await db.insert(orders).values({ id: "ord2", orgId: "o1", conversationId: "c1", itemsJson: "[]", totalCop: 2000, createdAt: new Date() });
    const latest = await getLatestOrderForConversation(db, "o1", "c1");
    expect(latest?.id).toBe("ord2");
    await setOrderShipping(db, "o1", "ord2", { addressJson: '{"ciudad":"Bogotá"}', quoteJson: '{"carrier":"X"}' });
    const after = await getLatestOrderForConversation(db, "o1", "c1");
    expect(after?.shippingAddressJson).toContain("Bogotá");
    expect(after?.shippingQuoteJson).toContain("X");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/catalog/orders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `orders.ts` (añade imports `and, desc, eq` de drizzle):
```ts
export async function getLatestOrderForConversation(db: DB, orgId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.conversationId, conversationId)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row ?? null;
}

export async function setOrderShipping(
  db: DB,
  orgId: string,
  orderId: string,
  input: { addressJson?: string; quoteJson?: string },
): Promise<void> {
  await db
    .update(orders)
    .set({
      ...(input.addressJson !== undefined ? { shippingAddressJson: input.addressJson } : {}),
      ...(input.quoteJson !== undefined ? { shippingQuoteJson: input.quoteJson } : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.orgId, orgId)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/catalog/orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/catalog/orders.ts src/lib/agent/catalog/orders.test.ts
git commit -m "feat(shipping): order shipping helpers (latest by conversation + setOrderShipping)"
```

---

## Task 6: Mipaquete provider (verificar API + implementar)

**Files:** Modify `src/lib/agent/integrations/shipping/mipaquete.ts`; Test `mipaquete.test.ts`.

- [ ] **Step 1: Verificar la API real**

Antes de implementar, verifica el endpoint de cotización de Mipaquete consultando su documentación: `WebFetch https://api.documentacion.mipaquete.com/` (es JS-rendered; si no rinde, usa `WebSearch "mipaquete API cotización endpoint body weight dimensions"` o Context7). Confirma: URL del endpoint de cotización, método, headers de auth (Bearer JWT), nombres de campos del body (origen/destino por código de ciudad, peso kg, dimensiones cm, valor declarado) y forma de la respuesta (lista con transportadora/precio/días). **Documenta lo encontrado como comentario en el archivo.** La interfaz `ShippingProvider.quote → CarrierQuote[]` NO cambia.

- [ ] **Step 2: Test con fetch mockeado**

Create `src/lib/agent/integrations/shipping/mipaquete.test.ts` (ajusta el shape del mock a lo verificado en Step 1; ejemplo con un shape representativo):
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMipaqueteShipping } from "./mipaquete";

afterEach(() => vi.restoreAllMocks());

describe("makeMipaqueteShipping", () => {
  it("mapea la respuesta a CarrierQuote[] y manda auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([
        { transportadora: "Servientrega", valor: 12000, tiempoEntrega: "2" },
        { transportadora: "Interrapidísimo", valor: 9000, tiempoEntrega: "3" },
      ]), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const p = makeMipaqueteShipping({ apiKey: "jwt-x", originCityCode: "05001000" });
    const quotes = await p.quote({
      originCityName: "Medellín", originCityCode: "05001000",
      destinationCityName: "Bogotá",
      pkg: { pesoFacturableKg: 1.6, lengthCm: 20, widthCm: 20, heightCm: 10 },
      declaredValueCop: 50000,
    });
    expect(quotes.length).toBe(2);
    expect(quotes[0].carrier).toBe("Servientrega");
    expect(quotes[0].priceCop).toBe(12000);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toContain("jwt-x");
  });
  it("HTTP error → []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const p = makeMipaqueteShipping({ apiKey: "x", originCityCode: "1" });
    expect(await p.quote({ originCityName: "A", destinationCityName: "B", pkg: { pesoFacturableKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 }, declaredValueCop: 1 })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/integrations/shipping/mipaquete.test.ts`
Expected: FAIL (stub devuelve []).

- [ ] **Step 4: Implementar (reemplaza el stub)**

Reemplaza el stub en `mipaquete.ts` con la impl real, mapeando los campos verificados. Estructura (ajusta URL/campos a lo confirmado):
```ts
import type { CarrierQuote, ShippingProvider, ShippingQuoteInput } from "./types";

// Verificado contra https://api.documentacion.mipaquete.com/ el 2026-06-22:
// endpoint de cotización: POST <URL>; auth: header Authorization con el JWT;
// body: origen/destino por código de ciudad, peso (kg), alto/largo/ancho (cm), valor declarado.
const QUOTE_URL = "https://api-v2.mipaquete.com/cotizar"; // AJUSTAR a la URL real verificada

export function makeMipaqueteShipping(opts: { apiKey: string; originCityCode: string }): ShippingProvider {
  return {
    async quote(input: ShippingQuoteInput): Promise<CarrierQuote[]> {
      try {
        const res = await fetch(QUOTE_URL, {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: opts.apiKey },
          body: JSON.stringify({
            origin: input.originCityCode ?? opts.originCityCode,
            destination: input.destinationCityName, // o el código resuelto (ver city resolver)
            weight: input.pkg.pesoFacturableKg,
            length: input.pkg.lengthCm,
            width: input.pkg.widthCm,
            height: input.pkg.heightCm,
            declaredValue: input.declaredValueCop,
          }),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as Array<Record<string, unknown>>;
        return data.map((d) => ({
          carrier: String(d.transportadora ?? d.carrier ?? "Transportadora"),
          service: String(d.servicio ?? d.service ?? ""),
          priceCop: Math.round(Number(d.valor ?? d.price ?? 0)),
          deliveryDays: d.tiempoEntrega != null ? Number(d.tiempoEntrega) : null,
        }));
      } catch {
        return [];
      }
    },
  };
}
```
> Si la API requiere resolver la ciudad de destino a un código (catálogo de ciudades de Mipaquete), añade una resolución mínima: pasar `destinationCityName` y dejar que el endpoint lo acepte, o cachear el catálogo. Documenta la decisión. Mantén `quote` tolerante a fallos (devuelve `[]`).

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/integrations/shipping/mipaquete.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/integrations/shipping/mipaquete.ts src/lib/agent/integrations/shipping/mipaquete.test.ts
git commit -m "feat(shipping): Mipaquete provider (verified API)"
```

---

## Task 7: Tool cotizar_envio

**Files:** Create `src/lib/agent/tools/builtin/cotizar-envio.ts`; Modify `registry.ts`; Test `cotizar-envio.test.ts`.

- [ ] **Step 1: Test**

Create `src/lib/agent/tools/builtin/cotizar-envio.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, orders, products } from "@/lib/db/schema";
import { saveShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { cotizarEnvio } from "./cotizar-envio";

async function seed(db: ReturnType<typeof makeTestDb>["db"]) {
  await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
  await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });
  await db.insert(products).values({ id: "p1", orgId: "o1", name: "Camisa", priceCop: 20000, available: true, weightGrams: 500, lengthCm: 20, widthCm: 20, heightCm: 5, createdAt: new Date() });
  await db.insert(orders).values({ id: "ord1", orgId: "o1", conversationId: "c1", itemsJson: JSON.stringify([{ productId: "p1", cantidad: 2 }]), totalCop: 40000, createdAt: new Date() });
}

describe("cotizar_envio", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeEach(async () => { db = makeTestDb().db; await seed(db); });

  it("cotiza con tabla manual y devuelve barata+rápida", async () => {
    await saveShippingConfig(db, "o1", {
      provider: "manual",
      credentials: {},
      config: { originCityName: "Medellín", volumetricFactor: 2500, rates: [{ maxWeightKg: 5, priceCop: 12000, deliveryDays: 3 }] },
    });
    const res = await cotizarEnvio.run({ ciudadDestino: "Bogotá" }, { db, orgId: "o1", conversationId: "c1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { opciones: Array<{ priceCop: number }> };
      expect(data.opciones.length).toBeGreaterThan(0);
      expect(data.opciones[0].priceCop).toBe(12000);
    }
  });

  it("falta peso/dims → error claro", async () => {
    await db.update(products).set({ weightGrams: null }).where(eq(products.id, "p1"));
    await saveShippingConfig(db, "o1", { provider: "manual", credentials: {}, config: { rates: [{ maxWeightKg: 5, priceCop: 1 }] } });
    const res = await cotizarEnvio.run({ ciudadDestino: "Bogotá" }, { db, orgId: "o1", conversationId: "c1" });
    expect(res.ok).toBe(false);
  });

  it("sin config de envíos → error", async () => {
    const res = await cotizarEnvio.run({ ciudadDestino: "Bogotá" }, { db, orgId: "o1", conversationId: "c1" });
    expect(res.ok).toBe(false);
  });
});
```
(añade `import { eq } from "drizzle-orm";`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/tools/builtin/cotizar-envio.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Create `src/lib/agent/tools/builtin/cotizar-envio.ts`:
```ts
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { products } from "@/lib/db/schema";
import { getShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { getShippingProvider } from "@/lib/agent/integrations/shipping/index";
import { computePackage, type PackageItem } from "@/lib/agent/shipping/package";
import { getLatestOrderForConversation } from "@/lib/agent/catalog/orders";
import type { AgentTool } from "../types";

const schema = z.object({
  ciudadDestino: z.string().min(1),
  valorDeclaradoCop: z.number().optional(),
});

export const cotizarEnvio: AgentTool = {
  name: "cotizar_envio",
  description:
    "Cotiza el envío del pedido actual a una ciudad de destino y devuelve las opciones (más barata y más rápida). Pide la ciudad de destino antes de usarla.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      ciudadDestino: { type: "string", description: "Ciudad de destino del envío" },
      valorDeclaradoCop: { type: "number", description: "Valor declarado (opcional; por defecto el total del pedido)" },
    },
    required: ["ciudadDestino"],
  },
  escalates: false,
  async run(args, ctx) {
    const { ciudadDestino, valorDeclaradoCop } = schema.parse(args);

    const cfg = await getShippingConfig(ctx.db, ctx.orgId);
    if (!cfg) return { ok: false, error: "Envíos no configurado" };

    const order = await getLatestOrderForConversation(ctx.db, ctx.orgId, ctx.conversationId);
    if (!order) return { ok: false, error: "No hay un pedido para cotizar" };

    let parsed: Array<{ productId: string; cantidad: number }>;
    try {
      parsed = JSON.parse(order.itemsJson);
    } catch {
      return { ok: false, error: "Pedido inválido" };
    }
    if (parsed.length === 0) return { ok: false, error: "El pedido no tiene productos" };

    const ids = parsed.map((i) => i.productId);
    const rows = await ctx.db.select().from(products).where(inArray(products.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const pkgItems: PackageItem[] = [];
    for (const it of parsed) {
      const p = byId.get(it.productId);
      if (!p) return { ok: false, error: "Producto del pedido no encontrado" };
      if (p.weightGrams == null || p.lengthCm == null || p.widthCm == null || p.heightCm == null) {
        return { ok: false, error: `Falta el peso o las dimensiones de "${p.name}". Cárgalos en el catálogo.` };
      }
      pkgItems.push({
        weightGrams: p.weightGrams, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm,
        quantity: it.cantidad,
      });
    }

    const factor = Number(cfg.config.volumetricFactor) || 2500;
    let pkg;
    try {
      pkg = computePackage(pkgItems, { volumetricFactor: factor });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "No pude calcular el paquete" };
    }

    const provider = getShippingProvider({ provider: cfg.provider, credentials: cfg.credentials, config: cfg.config });
    let quotes;
    try {
      quotes = await provider.quote({
        originCityName: String(cfg.config.originCityName ?? ""),
        originCityCode: cfg.config.originCityCode ? String(cfg.config.originCityCode) : undefined,
        destinationCityName: ciudadDestino,
        pkg: { pesoFacturableKg: pkg.pesoFacturableKg, lengthCm: pkg.dims.lengthCm, widthCm: pkg.dims.widthCm, heightCm: pkg.dims.heightCm },
        declaredValueCop: valorDeclaradoCop ?? order.totalCop,
      });
    } catch {
      return { ok: false, error: "No pude obtener cotizaciones en este momento" };
    }
    if (quotes.length === 0) return { ok: false, error: "Sin opciones de envío para ese destino" };

    const barata = [...quotes].sort((a, b) => a.priceCop - b.priceCop)[0];
    const rapida = [...quotes]
      .filter((q) => q.deliveryDays != null)
      .sort((a, b) => (a.deliveryDays as number) - (b.deliveryDays as number))[0] ?? barata;

    const opciones = [barata, ...(rapida.carrier !== barata.carrier || rapida.service !== barata.service ? [rapida] : [])];
    return { ok: true, data: { pesoFacturableKg: Math.round(pkg.pesoFacturableKg * 100) / 100, opciones } };
  },
};
```

- [ ] **Step 4: Registrar el tool**

En `src/lib/agent/tools/registry.ts`: `import { cotizarEnvio } from "./builtin/cotizar-envio";` y añade `cotizar_envio: cotizarEnvio,` a `BUILTIN_TOOLS`.

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/tools/builtin/cotizar-envio.test.ts src/lib/agent/tools/registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tools/builtin/cotizar-envio.ts src/lib/agent/tools/builtin/cotizar-envio.test.ts src/lib/agent/tools/registry.ts
git commit -m "feat(shipping): cotizar_envio tool"
```

---

## Task 8: Tool guardar_direccion_envio

**Files:** Create `src/lib/agent/tools/builtin/guardar-direccion-envio.ts`; Modify `registry.ts`; Test.

- [ ] **Step 1: Test**

Create `src/lib/agent/tools/builtin/guardar-direccion-envio.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { organization, conversations, orders } from "@/lib/db/schema";
import { getLatestOrderForConversation } from "@/lib/agent/catalog/orders";
import { guardarDireccionEnvio } from "./guardar-direccion-envio";

describe("guardar_direccion_envio", () => {
  let db: ReturnType<typeof makeTestDb>["db"];
  beforeEach(async () => {
    db = makeTestDb().db;
    await db.insert(organization).values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });
    await db.insert(conversations).values({ id: "c1", orgId: "o1", phone: "57300", lastMessageAt: new Date(), createdAt: new Date() });
    await db.insert(orders).values({ id: "ord1", orgId: "o1", conversationId: "c1", itemsJson: "[]", totalCop: 1000, createdAt: new Date() });
  });

  it("guarda la dirección estructurada en el pedido", async () => {
    const res = await guardarDireccionEnvio.run(
      { destinatario: "Ana", telefono: "3001112233", departamento: "Cundinamarca", ciudad: "Bogotá", direccion: "Cra 1 #2-3", barrio: "Centro" },
      { db, orgId: "o1", conversationId: "c1" },
    );
    expect(res.ok).toBe(true);
    const order = await getLatestOrderForConversation(db, "o1", "c1");
    const addr = JSON.parse(order!.shippingAddressJson as string);
    expect(addr.ciudad).toBe("Bogotá");
    expect(addr.destinatario).toBe("Ana");
  });

  it("sin pedido → error", async () => {
    const res = await guardarDireccionEnvio.run(
      { destinatario: "Ana", telefono: "3001112233", departamento: "X", ciudad: "Y", direccion: "Z" },
      { db, orgId: "o1", conversationId: "cX" },
    );
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/agent/tools/builtin/guardar-direccion-envio.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Create `src/lib/agent/tools/builtin/guardar-direccion-envio.ts`:
```ts
import { z } from "zod";
import { getLatestOrderForConversation, setOrderShipping } from "@/lib/agent/catalog/orders";
import type { AgentTool } from "../types";

const schema = z.object({
  destinatario: z.string().min(1),
  telefono: z.string().min(1),
  departamento: z.string().min(1),
  ciudad: z.string().min(1),
  direccion: z.string().min(1),
  barrio: z.string().optional(),
  indicaciones: z.string().optional(),
  transportadora: z.string().optional(),
  precioEnvioCop: z.number().optional(),
  diasEntrega: z.number().optional(),
});

export const guardarDireccionEnvio: AgentTool = {
  name: "guardar_direccion_envio",
  description:
    "Guarda la dirección de despacho del pedido (destinatario, teléfono, departamento, ciudad, dirección, barrio) y la opción de envío elegida. Úsala cuando el cliente confirme a dónde enviar.",
  paramsSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      destinatario: { type: "string" }, telefono: { type: "string" },
      departamento: { type: "string" }, ciudad: { type: "string" },
      direccion: { type: "string" }, barrio: { type: "string" }, indicaciones: { type: "string" },
      transportadora: { type: "string" }, precioEnvioCop: { type: "number" }, diasEntrega: { type: "number" },
    },
    required: ["destinatario", "telefono", "departamento", "ciudad", "direccion"],
  },
  escalates: false,
  async run(args, ctx) {
    const a = schema.parse(args);
    const order = await getLatestOrderForConversation(ctx.db, ctx.orgId, ctx.conversationId);
    if (!order) return { ok: false, error: "No hay un pedido para asociar la dirección" };
    const address = {
      destinatario: a.destinatario, telefono: a.telefono, departamento: a.departamento,
      ciudad: a.ciudad, direccion: a.direccion, barrio: a.barrio ?? null, indicaciones: a.indicaciones ?? null,
    };
    const quote = a.transportadora
      ? { carrier: a.transportadora, priceCop: a.precioEnvioCop ?? null, deliveryDays: a.diasEntrega ?? null }
      : undefined;
    await setOrderShipping(ctx.db, ctx.orgId, order.id, {
      addressJson: JSON.stringify(address),
      quoteJson: quote ? JSON.stringify(quote) : undefined,
    });
    return { ok: true, data: { guardado: true } };
  },
};
```

- [ ] **Step 4: Registrar**

En `registry.ts`: import + `guardar_direccion_envio: guardarDireccionEnvio,`.

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/lib/agent/tools/builtin/guardar-direccion-envio.test.ts src/lib/agent/tools/registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tools/builtin/guardar-direccion-envio.ts src/lib/agent/tools/builtin/guardar-direccion-envio.test.ts src/lib/agent/tools/registry.ts
git commit -m "feat(shipping): guardar_direccion_envio tool"
```

---

## Task 9: parse-inbound — mensaje de ubicación

**Files:** Modify `src/lib/inbox/parse-inbound.ts`; Test `parse-inbound.test.ts`.

- [ ] **Step 1: Test**

Añade a `src/lib/inbox/parse-inbound.test.ts` (reusa su estructura):
```ts
it("parsea un mensaje de ubicación", () => {
  const r = parseInboundMessage({ type: "location", location: { latitude: 4.6, longitude: -74.1, name: "Casa", address: "Cra 1 #2-3, Bogotá" } });
  expect(r.type).toBe("location");
  expect(r.body).toContain("Ubicación");
  expect(r.body).toContain("Casa");
  expect(r.payloadJson).toContain("4.6");
});
it("ubicación sin nombre usa la dirección o las coordenadas", () => {
  const r = parseInboundMessage({ type: "location", location: { latitude: 1, longitude: 2 } });
  expect(r.body).toContain("1");
  expect(r.body).toContain("2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/inbox/parse-inbound.test.ts`
Expected: FAIL (cae en "unknown", body null).

- [ ] **Step 3: Implementar**

En `parse-inbound.ts`, añade ANTES del `return { type: "unknown", ... }` final:
```ts
  if (msg.type === "location") {
    const l = msg.location ?? {};
    const label = l.name || l.address || `${l.latitude}, ${l.longitude}`;
    return { type: "location", body: `📍 Ubicación: ${label}`, mediaId: null, payloadJson: raw, replyToWamid };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/inbox/parse-inbound.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox/parse-inbound.ts src/lib/inbox/parse-inbound.test.ts
git commit -m "feat(shipping): parse WhatsApp location messages"
```

---

## Task 10: Panel — sección Envíos + peso/dims en producto + sidebar

**Files:** Modify `src/lib/agent/admin.ts` (saveShipping); `src/app/(app)/configuracion/agente/actions.ts`; Create `configuracion/agente/envios/page.tsx` + `_shipping.tsx`; Modify `src/app/(app)/layout.tsx`; Modify `_product-detail.tsx` (campos peso/dims) + `addProduct`/`upsertProductBySku` para aceptar peso/dims opcionales.

- [ ] **Step 1: admin.saveShipping + acción**

En `src/lib/agent/admin.ts` añade:
```ts
import { saveShippingConfig, type ShippingConfig } from "@/lib/agent/integrations/shipping/config";

export async function saveShipping(db: DB, orgId: string, input: ShippingConfig): Promise<void> {
  await saveShippingConfig(db, orgId, input);
}
```
En `configuracion/agente/actions.ts`:
```ts
import { saveShipping } from "@/lib/agent/admin";
import type { ShippingConfig } from "@/lib/agent/integrations/shipping/config";

export async function saveShippingAction(input: ShippingConfig): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try { await saveShipping(db, orgId, input); }
  catch (e) { return { error: e instanceof Error ? e.message : "Error" }; }
  revalidatePath("/configuracion/agente/envios");
  return { ok: true };
}
```

- [ ] **Step 2: Página + sección Envíos**

Create `configuracion/agente/envios/page.tsx`:
```tsx
import { requireOrg } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getShippingConfig } from "@/lib/agent/integrations/shipping/config";
import { AgentShipping } from "./_shipping";

export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  const { orgId } = await requireOrg();
  const cfg = await getShippingConfig(db, orgId);
  return (
    <AgentShipping
      provider={cfg?.provider ?? "manual"}
      originCityName={String(cfg?.config.originCityName ?? "")}
      volumetricFactor={Number(cfg?.config.volumetricFactor) || 2500}
      hasApiKey={!!cfg?.credentials.apiKey}
      ratesJson={JSON.stringify(cfg?.config.rates ?? [], null, 2)}
    />
  );
}
```
Create `configuracion/agente/envios/_shipping.tsx` (client; estilo de `_catalog.tsx`/`_calendar.tsx`): selector provider (Mipaquete / Tabla manual), campos: API key (si Mipaquete), ciudad de origen, factor volumétrico, y —si manual— un textarea con el JSON de tarifas (`[{ "city":"Bogotá", "maxWeightKg":1, "priceCop":8000, "deliveryDays":2 }]`). Al guardar llama `saveShippingAction({ provider, credentials: apiKey ? { apiKey } : {}, config: { originCityName, volumetricFactor, rates } })` (parsea el textarea con try/catch; si falla, toast de error). Usa `sonner` + `router.refresh()`. Mantén el componente simple (un Card con los campos y un botón Guardar).

- [ ] **Step 3: Sidebar + sub-link Envíos**

En `src/app/(app)/layout.tsx`, en la sección `"Agente IA"` de `NAV_SECTIONS`, añade tras "Medios de pago":
```ts
      { href: "/configuracion/agente/envios", icon: TruckIcon, label: "Envíos", module: "agente" },
```
y añade `TruckIcon` al import de `lucide-react`.

- [ ] **Step 4: Campos peso/dims en el editor de producto**

En `addProduct` y `upsertProductBySku` (admin.ts) acepta opcionalmente `weightGrams/lengthCm/widthCm/heightCm` y guárdalos. En `_product-detail.tsx` añade 4 inputs numéricos (peso g, largo/ancho/alto cm) en el formulario de edición del producto, guardando vía la acción que ya actualiza el producto (o una nueva `updateProductDimsAction`). Mantén el alcance acotado: si el editor de producto no tiene "guardar campos generales", añade una acción `updateProductAction(id, { weightGrams?, lengthCm?, widthCm?, heightCm? })` y una mini-fila de inputs.

- [ ] **Step 5: Verificar + commit**

Run: `bunx tsc --noEmit` + `bun run lint` → limpio.
```bash
git add "src/app/(app)" src/lib/agent/admin.ts
git commit -m "feat(shipping): panel Envíos + peso/dims producto + sidebar link"
```

---

## Task 11: Gauntlet + review + merge + deploy

- [ ] `bunx vitest run` (todo verde) · `bunx tsc --noEmit` (limpio; si `.next/types/* 2.ts`, `find .next/types -name "* 2.ts" -delete`) · `bun run lint` · `bun run build`.
- [ ] Smoke manual: configurar Envíos (tabla manual con 1-2 tarifas + origen), cargar peso/dims a un producto, simular pedido y verificar que `cotizar_envio` devuelve opciones; probar `guardar_direccion_envio`.
- [ ] `code-reviewer` sobre el diff (foco: multi-tenant, credenciales cifradas, tolerancia a fallos del provider, no romper el turno).
- [ ] Merge a main + `deploy/deploy.sh` (aplica mig 0024). Configurar la API key de Mipaquete de Luis en una org de prueba vía el panel (cifrada).
- [ ] Actualizar memoria.

---

## Self-Review (cobertura del spec)
- ✅ Peso/dims producto+variante → Task 1 (columnas). (Cotización usa peso/dims a nivel producto; el pedido no captura variantId — limitación v1 anotada.)
- ✅ agent_shipping + orders shipping → Task 1.
- ✅ computePackage (facturable=max real/volumétrico) → Task 2.
- ✅ ShippingProvider + manual → Task 3; config cifrada + index → Task 4; Mipaquete → Task 6.
- ✅ orders helpers → Task 5.
- ✅ cotizar_envio (barata+rápida, falta-datos, sin-config) → Task 7.
- ✅ guardar_direccion_envio (dirección estructurada en el pedido) → Task 8.
- ✅ Ubicación WA (parse + el agente la ve) → Task 9.
- ✅ Panel Envíos + peso/dims + sidebar → Task 10.
- ✅ Integración por org, credenciales cifradas, multi-tenant scoped, provider tolerante a fallos.

**Limitaciones v1 (anotadas):** cotización usa peso/dims a nivel producto (el pedido no guarda variante); dirección de despacho se guarda en el pedido (surfacing al vendedor en una vista de pedidos = follow-up); resolución ciudad→código de Mipaquete simplificada (verificar en Task 6).

**Consistencia de tipos:** `computePackage(PackageItem[], {volumetricFactor?})→ComputedPackage`; `ShippingProvider.quote(ShippingQuoteInput)→CarrierQuote[]`; `ShippingConfig{provider,credentials,config}`; `getShippingProvider(ShippingResolveInput)`; `getLatestOrderForConversation`/`setOrderShipping`; tools `cotizar_envio`/`guardar_direccion_envio`.
