export function matchOptOut(body: string, keywords: string[]): boolean {
  const normalized = body.trim().toUpperCase();
  for (const kw of keywords) {
    const k = kw.trim().toUpperCase();
    if (!k) continue;
    const re = new RegExp(`(^|\\b|\\s)${escapeRegex(k)}($|\\b|\\s|\\W)`, "i");
    if (re.test(normalized)) return true;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
