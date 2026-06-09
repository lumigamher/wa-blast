export function normalizeTemplateName(input: string, opts?: { live?: boolean }): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // any run of invalid chars → single _
    .replace(/_+/g, "_") // collapse repeated _
    .replace(/^_+/, ""); // trim leading _
  return opts?.live ? base : base.replace(/_+$/, ""); // trim trailing _ only on blur
}
