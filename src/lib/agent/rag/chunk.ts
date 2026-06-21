export type ChunkOptions = { maxChars?: number; overlapChars?: number };

/**
 * Trocea texto en fragmentos solapados. Determinístico (char-based).
 * Normaliza espacios, intenta cortar en límite de palabra/oración.
 */
export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 2000;
  const overlapChars = opts.overlapChars ?? 200;
  const text = input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(" "),
      );
      if (lastBreak > maxChars * 0.5) end = start + lastBreak + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}
