import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export function normalizePhone(input: string, defaultCountry: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}
