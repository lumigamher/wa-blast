import { listBodyVariableIndices } from "@/lib/template-vars";
import type { CarouselValue } from "@/app/(app)/plantillas/nueva/carousel-builder";

export function validateDatos(d: { name: string; language: string; category: string }): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9_]{3,}$/.test(d.name)) errs.push("El nombre debe tener 3+ caracteres (minúsculas, números, _)");
  if (!d.language) errs.push("Elige un idioma");
  if (!d.category) errs.push("Elige una categoría");
  return errs;
}

export function validateContenido(d: {
  headerKind: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText: string;
  headerHandle: string | null;
  bodyText: string;
  bodyExample: Record<number, string>;
  uploading: boolean;
}): string[] {
  const errs: string[] = [];
  if (!d.bodyText.trim()) errs.push("El cuerpo es obligatorio");
  for (const idx of listBodyVariableIndices(d.bodyText)) {
    if (!d.bodyExample[idx]?.trim()) errs.push(`Falta ejemplo para la variable {{${idx}}}`);
  }
  if (d.headerKind === "TEXT" && !d.headerText.trim()) errs.push("El header de texto no puede estar vacío");
  if ((d.headerKind === "IMAGE" || d.headerKind === "VIDEO" || d.headerKind === "DOCUMENT") && !d.headerHandle) {
    errs.push("Sube el archivo del header (espera a que termine)");
  }
  if (d.uploading) errs.push("Espera a que termine la subida del archivo");
  return errs;
}

export function validateBotones(buttons: Array<{ id: string; kind: "QUICK_REPLY" | "URL" | "FLOW"; text: string; url: string; flowId?: string }>): string[] {
  const errs: string[] = [];
  for (const b of buttons) {
    if (!b.text.trim()) errs.push("Todos los botones necesitan texto");
    if (b.kind === "URL" && !/^https?:\/\/.+/.test(b.url)) errs.push("Las URLs de botón deben empezar con http(s)://");
    if (b.kind === "FLOW" && !b.flowId) errs.push("Todos los botones Flow necesitan un Flow seleccionado");
  }
  return errs;
}

export function validateTarjetas(carousel: CarouselValue): string[] {
  const errs: string[] = [];
  if (carousel.cards.length < 2) errs.push("El carrusel necesita al menos 2 tarjetas");
  if (carousel.cards.some((c) => !c.handle || !c.assetId)) errs.push("Cada tarjeta necesita una imagen o video");
  return errs;
}
