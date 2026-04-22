export function countBodyVariables(text: string): number {
  const matches = text.match(/\{\{\d+\}\}/g) ?? [];
  const indices = new Set(matches.map((m) => Number(m.replace(/[^\d]/g, ""))));
  return indices.size;
}

export function listBodyVariableIndices(text: string): number[] {
  const matches = text.match(/\{\{\d+\}\}/g) ?? [];
  const indices = [...new Set(matches.map((m) => Number(m.replace(/[^\d]/g, ""))))];
  return indices.sort((a, b) => a - b);
}
