import * as XLSX from "xlsx";
import { normalizePhone } from "./phone";

export type ParsedFile = { headers: string[]; rows: Record<string, string>[] };

export async function parseContactsFile(file: File): Promise<ParsedFile> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    raw: false,
    defval: "",
  });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export type MappingConfig = {
  phoneCol: string;
  nameCol?: string;
  emailCol?: string;
  customCols: string[];
  defaultCountry: string;
};

export type ValidatedRow = {
  phone: string;
  name: string | null;
  email: string | null;
  customFields: Record<string, string>;
};

export type ValidationResult = {
  valid: ValidatedRow[];
  invalid: { row: Record<string, string>; reason: string }[];
  duplicateCount: number;
};

export function validateRows(rows: Record<string, string>[], cfg: MappingConfig): ValidationResult {
  const valid: ValidatedRow[] = [];
  const invalid: ValidationResult["invalid"] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const r of rows) {
    const rawPhone = (r[cfg.phoneCol] ?? "").trim();
    if (!rawPhone) {
      invalid.push({ row: r, reason: "phone is empty" });
      continue;
    }
    const phone = normalizePhone(rawPhone, cfg.defaultCountry);
    if (!phone) {
      invalid.push({ row: r, reason: "invalid phone" });
      continue;
    }
    if (seen.has(phone)) {
      duplicateCount++;
      continue;
    }
    seen.add(phone);

    const custom: Record<string, string> = {};
    for (const col of cfg.customCols) {
      const v = (r[col] ?? "").trim();
      if (v) custom[col] = v;
    }

    valid.push({
      phone,
      name: (cfg.nameCol ? (r[cfg.nameCol] ?? "").trim() : "") || null,
      email: (cfg.emailCol ? (r[cfg.emailCol] ?? "").trim() : "") || null,
      customFields: custom,
    });
  }

  return { valid, invalid, duplicateCount };
}
