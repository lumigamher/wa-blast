export function normalizeTemplateName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // any run of invalid chars → single _
    .replace(/_+/g, "_") // collapse repeated _
    .replace(/^_+|_+$/g, ""); // trim leading/trailing _
}
