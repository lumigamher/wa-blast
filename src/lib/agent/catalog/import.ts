import * as XLSX from "xlsx";

export type ProductRawRow = Record<string, string>;

export async function parseProductsFile(file: File): Promise<{ headers: string[]; rows: ProductRawRow[] }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ProductRawRow>(ws, { raw: false, defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export type ImportVariant = { label: string; priceCop: number | null; sku: string | null; available: boolean };
export type ValidProductRow = {
  sku: string | null;
  name: string | null;
  priceCop: number | null;
  description: string | null;
  available: boolean;
  variant: ImportVariant | null;
};
export type ProductValidation = {
  valid: ValidProductRow[];
  invalid: { row: number; error: string }[];
  productCount: number;
  variantCount: number;
};

function lowerKeys(r: ProductRawRow): ProductRawRow {
  const out: ProductRawRow = {};
  for (const k of Object.keys(r)) {
    out[k.trim().toLowerCase()] = r[k];
  }
  return out;
}

function parseBool(v: string | undefined, dflt = true): boolean {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "") return dflt;
  return !["no", "false", "0", "agotado", "n"].includes(s);
}

function parsePrice(v: string | undefined): number | null {
  const cleaned = (v ?? "").replace(/[^0-9.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function validateProductRows(rows: ProductRawRow[]): ProductValidation {
  const valid: ValidProductRow[] = [];
  const invalid: { row: number; error: string }[] = [];
  let productCount = 0;
  let variantCount = 0;

  rows.forEach((raw, i) => {
    const rowNum = i + 2;
    const r = lowerKeys(raw);

    const name = (r["nombre"] ?? "").trim();
    const sku = (r["sku"] ?? "").trim() || null;
    const variantLabel = (r["variante"] ?? "").trim();

    // Empty row (neither product nor variant)
    if (!name && !variantLabel) {
      invalid.push({ row: rowNum, error: "fila vacía (sin nombre ni variante)" });
      return;
    }

    // Variant without SKU
    if (variantLabel && !sku) {
      invalid.push({ row: rowNum, error: "la variante necesita el sku del producto" });
      return;
    }

    // Parse product price (required if row has product name)
    let priceCop: number | null = null;
    if (name) {
      priceCop = parsePrice(r["precio"]);
      if (priceCop === null || priceCop < 0) {
        invalid.push({ row: rowNum, error: "precio inválido" });
        return;
      }
      productCount++;
    }

    // Parse variant
    const variant: ImportVariant | null = variantLabel
      ? {
          label: variantLabel,
          priceCop: parsePrice(r["precio_variante"]),
          sku: (r["sku_variante"] ?? "").trim() || null,
          available: parseBool(r["disponible_variante"]),
        }
      : null;

    if (variant) variantCount++;

    valid.push({
      sku,
      name: name || null,
      priceCop,
      description: (r["descripcion"] ?? "").trim() || null,
      available: parseBool(r["disponible"]),
      variant,
    });
  });

  return { valid, invalid, productCount, variantCount };
}
