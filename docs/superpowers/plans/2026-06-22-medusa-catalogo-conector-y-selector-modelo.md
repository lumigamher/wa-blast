# Conector Medusa nativo + selector de modelo curado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente de Lula pueda conectar un ecommerce Medusa v2 (El Man de los Teclados) desde la config nativa y traer productos reales (con variantes, imágenes y precio COP), y que el panel exponga un selector de modelo de IA curado en vez de texto libre.

**Architecture:** Nuevo `CatalogProvider` "medusa" (mismo patrón que `shopify.ts`), enchufado en el resolver `index.ts` y en el union de proveedor que recorre schema/config/admin/UI. El selector de modelo lee una constante curada `CURATED_MODELS` y conserva un escape "Personalizado…".

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle (bun:sqlite), Vitest (`bunx vitest run`), shadcn/ui (Select/Input).

**Spec:** `docs/superpowers/specs/2026-06-22-medusa-catalogo-conector-y-selector-modelo-design.md`

**Convención de tests del repo:** `bunx vitest run <ruta>` (NO `bun test`). Los tests de catálogo mockean `fetch` con `vi.spyOn(globalThis, "fetch")` (ver `src/lib/agent/integrations/catalog/shopify.test.ts`).

---

## Task 1: Conector Medusa (`makeMedusaCatalog`)

**Files:**
- Create: `src/lib/agent/integrations/catalog/medusa.ts`
- Test: `src/lib/agent/integrations/catalog/medusa.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/integrations/catalog/medusa.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMedusaCatalog } from "./medusa";

afterEach(() => vi.restoreAllMocks());

const PRODUCTS = {
  products: [
    {
      id: "prod_1",
      title: "Teclado mecánico KOKO",
      description: "RGB",
      thumbnail: "https://cdn/x/thumb.jpg",
      images: [{ url: "https://cdn/x/thumb.jpg" }, { url: "https://cdn/x/2.jpg" }],
      variants: [
        {
          id: "var_a",
          title: "Switch rojo",
          sku: "KOKO-R",
          calculated_price: { calculated_amount: 189900 },
          inventory_quantity: 5,
          manage_inventory: true,
        },
        {
          id: "var_b",
          title: "Switch azul",
          sku: "KOKO-B",
          calculated_price: { calculated_amount: 179900 },
          inventory_quantity: 0,
          allow_backorder: false,
          manage_inventory: true,
        },
      ],
    },
  ],
};

function mockFetch(handler: (url: string) => unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    return Promise.resolve(new Response(JSON.stringify(handler(url)), { status: 200 }));
  });
}

describe("medusa catalog", () => {
  it("search mapea producto con variantes, imágenes y precio menor", async () => {
    mockFetch((url) =>
      url.includes("/store/regions") ? { regions: [{ id: "reg_1" }] } : PRODUCTS,
    );
    const cat = makeMedusaCatalog({
      backendUrl: "https://api.elman.com",
      publishableKey: "pk_test",
    });
    const res = await cat.search({ query: "teclado" });

    expect(res).toHaveLength(1);
    const p = res[0];
    expect(p.id).toBe("prod_1");
    expect(p.name).toBe("Teclado mecánico KOKO");
    expect(p.priceCop).toBe(179900); // menor variante válida
    expect(p.available).toBe(true); // var_a tiene stock
    expect(p.variants).toHaveLength(2);
    expect(p.variants?.[1]).toMatchObject({ id: "var_b", available: false });
    expect(p.images).toHaveLength(2); // thumb dedupe
  });

  it("manda x-publishable-api-key y region_id en /store/products", async () => {
    const fetchMock = mockFetch((url) =>
      url.includes("/store/regions") ? { regions: [{ id: "reg_1" }] } : PRODUCTS,
    );
    const cat = makeMedusaCatalog({
      backendUrl: "https://api.elman.com",
      publishableKey: "pk_test",
    });
    await cat.search({ query: "teclado" });

    const productsCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/store/products"),
    );
    expect(String(productsCall?.[0])).toContain("region_id=reg_1");
    const headers = (productsCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers["x-publishable-api-key"]).toBe("pk_test");
  });

  it("usa regionId de config sin llamar a /store/regions", async () => {
    const fetchMock = mockFetch(() => PRODUCTS);
    const cat = makeMedusaCatalog({
      backendUrl: "https://api.elman.com",
      publishableKey: "pk_test",
      regionId: "reg_cfg",
    });
    await cat.search({ query: "x" });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/store/regions"))).toBe(false);
    const productsCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/store/products"));
    expect(String(productsCall?.[0])).toContain("region_id=reg_cfg");
  });

  it("descarta producto sin variantes con precio válido", async () => {
    mockFetch((url) =>
      url.includes("/store/regions")
        ? { regions: [{ id: "reg_1" }] }
        : { products: [{ id: "p", title: "Sin precio", variants: [{ id: "v" }] }] },
    );
    const cat = makeMedusaCatalog({ backendUrl: "https://api.elman.com", publishableKey: "pk" });
    expect(await cat.search({ query: "x" })).toEqual([]);
  });

  it("error de red → [] en search y null en get", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const cat = makeMedusaCatalog({ backendUrl: "https://api.elman.com", publishableKey: "pk", regionId: "r" });
    expect(await cat.search({ query: "x" })).toEqual([]);
    expect(await cat.get("p")).toBeNull();
  });

  it("get mapea un producto por id", async () => {
    mockFetch(() => ({ product: PRODUCTS.products[0] }));
    const cat = makeMedusaCatalog({ backendUrl: "https://api.elman.com", publishableKey: "pk", regionId: "r" });
    const p = await cat.get("prod_1");
    expect(p?.id).toBe("prod_1");
    expect(p?.priceCop).toBe(179900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/agent/integrations/catalog/medusa.test.ts`
Expected: FAIL — `Cannot find module './medusa'` / `makeMedusaCatalog is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/agent/integrations/catalog/medusa.ts`:

```ts
import type {
  CatalogProvider,
  Product,
  ProductImage,
  ProductVariant,
} from "./types";

interface MedusaCatalogConfig {
  backendUrl: string;
  publishableKey: string;
  regionId?: string;
}

type MedusaVariant = {
  id?: unknown;
  title?: unknown;
  sku?: unknown;
  calculated_price?: { calculated_amount?: unknown } | null;
  inventory_quantity?: unknown;
  allow_backorder?: unknown;
  manage_inventory?: unknown;
};
type MedusaProduct = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  thumbnail?: unknown;
  variants?: MedusaVariant[];
  images?: { url?: unknown }[];
};

const FIELDS = "*variants.calculated_price,*images";

export function makeMedusaCatalog(cfg: MedusaCatalogConfig): CatalogProvider {
  const base = cfg.backendUrl.replace(/\/+$/, "");
  const headers = { "x-publishable-api-key": cfg.publishableKey };
  let cachedRegionId: string | null = cfg.regionId?.trim() ? cfg.regionId.trim() : null;

  async function fetchJson(path: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${base}${path}`, { headers, signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function resolveRegionId(): Promise<string | null> {
    if (cachedRegionId) return cachedRegionId;
    const data = await fetchJson("/store/regions");
    const id = data?.regions?.[0]?.id;
    if (typeof id === "string" && id) {
      cachedRegionId = id;
      return id;
    }
    return null;
  }

  function mapVariant(raw: MedusaVariant): ProductVariant | null {
    const id = raw?.id ? String(raw.id) : "";
    const priceNum = Number(raw?.calculated_price?.calculated_amount);
    if (!id || !Number.isFinite(priceNum) || priceNum < 0) return null;
    const available =
      raw?.manage_inventory === false ||
      raw?.allow_backorder === true ||
      Number(raw?.inventory_quantity ?? 0) > 0;
    return {
      id,
      label: raw?.title ? String(raw.title) : "",
      priceCop: Math.round(priceNum),
      sku: raw?.sku ? String(raw.sku) : null,
      available,
    };
  }

  function mapProduct(raw: MedusaProduct): Product | null {
    const id = raw?.id ? String(raw.id) : "";
    const name = raw?.title ? String(raw.title) : "";
    if (!id || !name) return null;
    const variants = (raw?.variants ?? [])
      .map(mapVariant)
      .filter((v): v is ProductVariant => v !== null);
    if (variants.length === 0) return null;
    const priceCop = Math.min(...variants.map((v) => v.priceCop));
    const images: ProductImage[] = [];
    if (raw?.thumbnail) images.push({ url: String(raw.thumbnail) });
    for (const img of raw?.images ?? []) {
      if (img?.url) {
        const url = String(img.url);
        if (!images.some((i) => i.url === url)) images.push({ url });
      }
    }
    return {
      id,
      name,
      priceCop,
      description: raw?.description ? String(raw.description) : null,
      available: variants.some((v) => v.available),
      variants,
      images,
    };
  }

  return {
    async search({ query, limit = 10 }): Promise<Product[]> {
      const regionId = await resolveRegionId();
      if (!regionId) return [];
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        region_id: regionId,
        fields: FIELDS,
      });
      const data = await fetchJson(`/store/products?${params}`);
      const items: MedusaProduct[] = Array.isArray(data?.products) ? data.products : [];
      return items
        .map(mapProduct)
        .filter((p): p is Product => p !== null)
        .slice(0, limit);
    },

    async get(id: string): Promise<Product | null> {
      const regionId = await resolveRegionId();
      if (!regionId) return null;
      const params = new URLSearchParams({ region_id: regionId, fields: FIELDS });
      const data = await fetchJson(`/store/products/${encodeURIComponent(id)}?${params}`);
      const raw = data?.product;
      if (!raw || typeof raw !== "object") return null;
      return mapProduct(raw as MedusaProduct);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/agent/integrations/catalog/medusa.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/agent/integrations/catalog/medusa.ts src/lib/agent/integrations/catalog/medusa.test.ts
git commit -m "feat(catalog): conector Medusa v2 (variantes+imagenes+precio COP)"
```

---

## Task 2: Enchufar "medusa" en el union de proveedor

**Files:**
- Modify: `src/lib/db/schema/domain.ts:662` (enum del campo `provider`)
- Modify: `src/lib/agent/integrations/catalog/config.ts` (tipo `CatalogConfig.provider`)
- Modify: `src/lib/agent/admin.ts:78,84` (`CatalogInput.provider` + validación)
- Modify: `src/lib/agent/integrations/catalog/index.ts` (`CatalogResolveInput.provider` + `case "medusa"`)
- Test: `src/lib/agent/integrations/catalog/index.test.ts`

> Nota: el campo `provider` es `text(... { enum })` en Drizzle SQLite — el enum es solo type-level (no genera CHECK). **No requiere migración**.

- [ ] **Step 1: Write the failing test**

Añade al final del `describe("getCatalogProvider")` de `src/lib/agent/integrations/catalog/index.test.ts` (reutiliza `makeTestDb` y el tipo `CatalogResolveInput` ya importados en el archivo):

```ts
  it("resuelve medusa catalog", () => {
    const { db } = makeTestDb();
    const input: CatalogResolveInput = {
      provider: "medusa",
      db,
      orgId: "o1",
      credentials: { publishableKey: "pk_test" },
      config: { backendUrl: "https://api.elman.com", regionId: "reg_1" },
    };
    const provider = getCatalogProvider(input);
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.get).toBe("function");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/agent/integrations/catalog/index.test.ts`
Expected: FAIL — type error / `Provider de catálogo no soportado: medusa`.

- [ ] **Step 3: Implementation**

3a. `src/lib/db/schema/domain.ts` línea 662 — añade `"medusa"`:

```ts
  provider: text("provider", { enum: ["internal", "http", "shopify", "medusa"] })
```

3b. `src/lib/agent/integrations/catalog/config.ts` — en el tipo `CatalogConfig`:

```ts
export type CatalogConfig = {
  provider: "internal" | "http" | "shopify" | "medusa";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};
```

3c. `src/lib/agent/admin.ts` — `CatalogInput` (línea ~78) y la validación (línea ~84):

```ts
export type CatalogInput = {
  provider: "internal" | "http" | "shopify" | "medusa";
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};
```
```ts
  if (!["internal", "http", "shopify", "medusa"].includes(input.provider)) throw new Error("Provider inválido");
```

3d. `src/lib/agent/integrations/catalog/index.ts` — import, union y nuevo case:

```ts
import { makeMedusaCatalog } from "./medusa";
```
```ts
export type CatalogResolveInput = {
  provider: "internal" | "http" | "shopify" | "medusa";
  db: DB;
  orgId: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};
```
Dentro del `switch`, antes del `default`:
```ts
    case "medusa":
      return makeMedusaCatalog({
        backendUrl: String(input.config.backendUrl ?? ""),
        publishableKey: input.credentials.publishableKey ?? "",
        regionId: input.config.regionId ? String(input.config.regionId) : undefined,
      });
```

- [ ] **Step 4: Run tests + typecheck**

Run:
```bash
cd ~/Documents/wa-blast
bunx vitest run src/lib/agent/integrations/catalog/
bunx tsc --noEmit
```
Expected: tests PASS, typecheck limpio.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/db/schema/domain.ts src/lib/agent/integrations/catalog/config.ts src/lib/agent/admin.ts src/lib/agent/integrations/catalog/index.ts src/lib/agent/integrations/catalog/index.test.ts
git commit -m "feat(catalog): registrar provider medusa en resolver y union de tipos"
```

---

## Task 3: UI de configuración Medusa en `_catalog.tsx`

**Files:**
- Modify: `src/app/(app)/configuracion/agente/_catalog.tsx`

(El `provider` prop fluye desde `catalogo/page.tsx:50` que ya pasa `catalogConfig?.provider`; al ampliar el union en Task 2 el tipo encaja sin tocar la página.)

- [ ] **Step 1: Ampliar el tipo del prop y el estado**

En `_catalog.tsx`, cambia la firma del prop (línea ~25):
```ts
  provider: "internal" | "http" | "shopify" | "medusa";
```
Añade al objeto `useState` (junto a `shop`/`storefrontToken`):
```ts
    backendUrl: (config.backendUrl as string) ?? "",
    publishableKey: "",
    regionId: (config.regionId as string) ?? "",
```

- [ ] **Step 2: Rama de guardado en `handleSubmit`**

Reemplaza el `else` final (la rama Shopify, líneas ~60-66) por un `else if` Shopify + `else if` Medusa, para no dejar la rama Medusa cayendo en Shopify:
```ts
        } else if (values.provider === "shopify") {
          input = {
            provider: "shopify",
            credentials: { storefrontToken: values.storefrontToken },
            config: { shop: values.shop },
          };
        } else {
          input = {
            provider: "medusa",
            credentials: { publishableKey: values.publishableKey },
            config: { backendUrl: values.backendUrl, regionId: values.regionId },
          };
        }
```
Y en el reset tras guardar (línea ~73) añade el limpiado del secreto:
```ts
          setValues({ ...values, apiKey: "", storefrontToken: "", publishableKey: "" });
```

- [ ] **Step 3: Opción en el `<Select>` de proveedor**

En el guard del `onValueChange` (línea ~97) añade `"medusa"`:
```ts
                if (v === "internal" || v === "http" || v === "shopify" || v === "medusa") {
```
Y agrega el `<SelectItem>` tras el de Shopify (línea ~108):
```tsx
                <SelectItem value="medusa">Medusa</SelectItem>
```

- [ ] **Step 4: Bloque de campos Medusa**

Tras el bloque `{values.provider === "shopify" && ( ... )}` (después de la línea ~228) añade:
```tsx
          {/* Medusa provider fields */}
          {values.provider === "medusa" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="medusa-url">URL del backend</Label>
                <Input
                  id="medusa-url"
                  value={values.backendUrl}
                  onChange={(e) => setValues({ ...values, backendUrl: e.target.value })}
                  placeholder="https://api.tutienda.com"
                />
                <p className="text-xs text-muted-foreground">
                  El backend de Medusa, no el storefront. Ej: https://api.elmandelosteclados.com
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="medusa-pk">Publishable API key</Label>
                <Input
                  id="medusa-pk"
                  type="password"
                  value={values.publishableKey}
                  onChange={(e) => setValues({ ...values, publishableKey: e.target.value })}
                  placeholder={provider === "medusa" ? "•••• (déjalo vacío para no cambiarla)" : "pk_..."}
                />
                {provider === "medusa" && (
                  <p className="text-xs text-muted-foreground">
                    Déjalo vacío para mantener la existente.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="medusa-region">Region ID (opcional)</Label>
                <Input
                  id="medusa-region"
                  value={values.regionId}
                  onChange={(e) => setValues({ ...values, regionId: e.target.value })}
                  placeholder="reg_... (vacío = región por defecto)"
                />
                <p className="text-xs text-muted-foreground">
                  Si lo dejas vacío, se usa la primera región de tu tienda.
                </p>
              </div>
            </>
          )}
```

- [ ] **Step 5: Verificar typecheck + build de la ruta**

Run:
```bash
cd ~/Documents/wa-blast
bunx tsc --noEmit
```
Expected: limpio. (Revisa que `provider === "medusa"` no genere warning de comparación imposible — el prop ya es el union ampliado.)

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/wa-blast
git add "src/app/(app)/configuracion/agente/_catalog.tsx"
git commit -m "feat(catalog-ui): formulario de conexion Medusa en config del agente"
```

---

## Task 4: Constante `CURATED_MODELS`

**Files:**
- Modify: `src/lib/agent/providers/index.ts`
- Test: `src/lib/agent/providers/index.test.ts`

- [ ] **Step 1: Write the failing test**

Añade a `src/lib/agent/providers/index.test.ts`:

```ts
import { CURATED_MODELS } from "./index";

describe("CURATED_MODELS", () => {
  it("tiene modelos para openai y anthropic con ids válidos", () => {
    expect(CURATED_MODELS.openai.length).toBeGreaterThan(0);
    expect(CURATED_MODELS.anthropic.length).toBeGreaterThan(0);
    for (const list of [CURATED_MODELS.openai, CURATED_MODELS.anthropic]) {
      for (const m of list) {
        expect(m.id).toBeTruthy();
        expect(m.label).toBeTruthy();
        expect(["💲", "💲💲", "💲💲💲"]).toContain(m.cost);
      }
    }
  });

  it("incluye el default gpt-5-mini y claude-haiku-4-5", () => {
    expect(CURATED_MODELS.openai.some((m) => m.id === "gpt-5-mini")).toBe(true);
    expect(CURATED_MODELS.anthropic.some((m) => m.id === "claude-haiku-4-5-20251001")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/agent/providers/index.test.ts`
Expected: FAIL — `CURATED_MODELS` no exportado.

- [ ] **Step 3: Implementation**

En `src/lib/agent/providers/index.ts`, añade arriba (tras los imports):

```ts
export type CuratedModel = {
  id: string;
  label: string;
  hint: string;
  cost: "💲" | "💲💲" | "💲💲💲";
};

export const CURATED_MODELS: Record<"openai" | "anthropic", CuratedModel[]> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "Rápido, recomendado para alto volumen", cost: "💲" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Equilibrado calidad/costo", cost: "💲💲" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", hint: "Máxima calidad", cost: "💲💲💲" },
  ],
  openai: [
    { id: "gpt-5-mini", label: "GPT-5 mini", hint: "Rápido, recomendado", cost: "💲" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", hint: "Mayor capacidad", cost: "💲💲" },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/wa-blast && bunx vitest run src/lib/agent/providers/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/wa-blast
git add src/lib/agent/providers/index.ts src/lib/agent/providers/index.test.ts
git commit -m "feat(agent): catalogo curado de modelos LLM por proveedor"
```

---

## Task 5: Selector de modelo curado en `_form.tsx`

**Files:**
- Modify: `src/app/(app)/configuracion/agente/_form.tsx`

- [ ] **Step 1: Importar la constante y derivar estado custom**

En `_form.tsx`, añade el import:
```ts
import { CURATED_MODELS } from "@/lib/agent/providers";
```
Y un estado para el modo "Personalizado…" justo donde se declaran los otros `useState` (cerca de `advancedOpen`):
```ts
const initialModelIsCurated = CURATED_MODELS[
  (config.provider as "openai" | "anthropic") ?? "openai"
].some((m) => m.id === config.model);
const [customModel, setCustomModel] = useState(!initialModelIsCurated);
```

- [ ] **Step 2: Reemplazar el bloque "Model"**

Sustituye el bloque `{/* Model */}` actual (el `<div>` con el `<Input id="model">` y su `<p>` de ayuda, líneas ~193-206) por:

```tsx
                {/* Model */}
                <div className="space-y-1.5">
                  <Label htmlFor="model">Modelo</Label>
                  <Select
                    value={customModel ? "__custom__" : values.model}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setCustomModel(true);
                      } else {
                        setCustomModel(false);
                        setValues({ ...values, model: v });
                      }
                    }}
                  >
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Selecciona un modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CURATED_MODELS[values.provider as "openai" | "anthropic"].map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label} · {m.cost} — {m.hint}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Personalizado…</SelectItem>
                    </SelectContent>
                  </Select>
                  {customModel && (
                    <Input
                      className="mt-2"
                      value={values.model}
                      onChange={(e) => setValues({ ...values, model: e.target.value })}
                      placeholder={values.provider === "openai" ? "gpt-5-mini" : "claude-haiku-4-5-20251001"}
                    />
                  )}
                </div>
```

- [ ] **Step 3: Reajustar modelo al cambiar de proveedor**

En el `onValueChange` del `<Select>` de proveedor (línea ~177), reemplaza el cuerpo para reencajar el modelo si el actual no pertenece al nuevo proveedor:
```tsx
                  <Select value={values.provider} onValueChange={(v) => {
                    if (v === "openai" || v === "anthropic") {
                      const list = CURATED_MODELS[v];
                      const stillValid = list.some((m) => m.id === values.model);
                      setValues({
                        ...values,
                        provider: v,
                        model: stillValid || customModel ? values.model : list[0].id,
                      });
                    }
                  }}>
```

- [ ] **Step 4: Verificar typecheck**

Run:
```bash
cd ~/Documents/wa-blast
bunx tsc --noEmit
```
Expected: limpio. (Confirma que `Select/SelectItem/SelectValue/SelectTrigger/SelectContent` ya están importados en `_form.tsx` — lo están, se usan en Plantilla/Proveedor.)

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/wa-blast
git add "src/app/(app)/configuracion/agente/_form.tsx"
git commit -m "feat(agent-ui): selector de modelo curado con escape personalizado"
```

---

## Task 6: Verificación end-to-end en vivo + ship

**Files:** ninguno (verificación). Requiere la publishable key de El Man.

- [ ] **Step 1: Obtener la publishable key de El Man**

Opción A — desde el storefront en el VPS:
```bash
ssh root@79.143.177.73 "grep -ri 'PUBLISHABLE' /path/al/storefront/.env*"
```
(la ruta del storefront vive en el VPS de El Man; ver memoria `project_el_man_de_los_teclados`).
Opción B — Medusa admin `https://admin.elmandelosteclados.com` → Settings → Publishable API Keys.

- [ ] **Step 2: Probar el conector contra la API real**

Reemplaza `PK` y corre un smoke directo (sin UI):
```bash
cd ~/Documents/wa-blast
bunx tsx -e 'import { makeMedusaCatalog } from "./src/lib/agent/integrations/catalog/medusa"; const c = makeMedusaCatalog({ backendUrl: "https://api.elmandelosteclados.com", publishableKey: "PK" }); c.search({ query: "teclado" }).then((r) => console.log(JSON.stringify(r.slice(0,2), null, 2)));'
```
Expected: 1-2 productos reales con `priceCop` > 0, `variants` e `images`.
**Si `priceCop` viniera en otra escala** (ej. /100): ajustar el factor en `mapVariant` (`Math.round(priceNum)`), un único punto, y re-correr Task 1 Step 4.

- [ ] **Step 3: Probar desde la UI**

```bash
cd ~/Documents/wa-blast && bun run dev
```
- Ir a `configuracion/agente/catalogo`, proveedor **Medusa**, pegar URL + pk, guardar.
- Confirmar toast "Catálogo guardado".
- En `configuracion/agente` (panel), abrir **Avanzado** → confirmar el **selector de modelo** curado y la opción "Personalizado…".

- [ ] **Step 4: Turno real del agente (sandbox de pruebas)**

Usa el runner de pruebas del agente si existe (`src/lib/agent/testing`) o el inbox: mensaje "¿tienen teclados mecánicos?" a la org conectada y confirmar que el agente cotiza con datos vivos de Medusa.

- [ ] **Step 5: Ship (lint + typecheck + tests + review)**

Run:
```bash
cd ~/Documents/wa-blast
bun run lint && bunx tsc --noEmit && bunx vitest run
```
Expected: todo verde. Pasar el diff por `code-reviewer` antes de mergear.

- [ ] **Step 6: Merge de la rama de feature** (según el flujo del repo: rama→review→merge→deploy).

---

## Self-Review (cobertura del spec)

- **Componente 1 (conector Medusa):** Task 1 (provider+tests) + Task 2 (resolver/union) + Task 3 (UI). Variantes/imágenes/stock/precio menor/auto-región/robustez cubiertos en Task 1. ✓
- **Componente 2 (selector curado):** Task 4 (constante) + Task 5 (UI con escape "Personalizado…", reajuste al cambiar proveedor). ✓
- **Componente 3 (prueba en vivo):** Task 6, incluye el riesgo de escala de precio documentado en el spec. ✓
- **Sin migración:** el campo `provider` es enum type-level en Drizzle SQLite — anotado en Task 2. ✓
- **Consistencia de tipos:** `CatalogInput`/`CatalogConfig`/`CatalogResolveInput`/`agentCatalog.provider` todos pasan al union de 4 valores; credencial `publishableKey` y config `backendUrl`/`regionId` coinciden entre `index.ts` (Task 2), `_catalog.tsx` (Task 3) y `makeMedusaCatalog` (Task 1). ✓
