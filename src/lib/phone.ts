export function normalizePhone(raw: string): string | null {
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (digits.length < 8 || digits.length > 15) return null;
    return cleaned;
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) {
    return `+57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("57")) {
    return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}
