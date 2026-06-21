import { extractText, getDocumentProxy } from "unpdf";

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Extrae texto plano de un archivo subido (txt/md/csv/… directo; PDF vía unpdf). */
export async function extractDocumentText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  if (isPdf(file)) {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      const clean = (text ?? "").trim();
      if (!clean) throw new Error("PDF sin texto extraíble (¿escaneado?)");
      return clean;
    } catch (e) {
      throw new Error(`No pude leer el PDF: ${e instanceof Error ? e.message : "ilegible"}`);
    }
  }
  return new TextDecoder().decode(buf).trim();
}
