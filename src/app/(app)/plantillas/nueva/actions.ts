"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { MetaApiError, credsFromSettings, createTemplate, createAuthTemplate } from "@/lib/meta/graph";
import { templateCardMedia } from "@/lib/db/schema";
import type { CardInput } from "@/lib/meta/types";

const nameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "Usa solo minúsculas, números y guiones bajos");

const variableListSchema = z.array(z.string().min(1)).max(20);

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().url() }),
  z.object({ type: z.literal("FLOW"), text: z.string().min(1).max(25), flow_id: z.string().min(1) }),
]);

const inputSchema = z.object({
  name: nameSchema,
  language: z.string().min(2).max(10),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  headerType: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).default("NONE"),
  headerText: z.string().max(60).optional().nullable(),
  headerExample: variableListSchema.optional(),
  headerHandle: z.string().min(1).optional().nullable(),
  bodyText: z.string().min(1).max(1024),
  bodyExample: variableListSchema.optional(),
  footerText: z.string().max(60).optional().nullable(),
  buttons: z.array(buttonSchema).max(3).optional(),
});

export type CreateTemplateResult =
  | { ok: true; id: string; status: string; name: string }
  | { ok: false; error: string; code?: number };

function countBodyVariables(text: string): number {
  const matches = Array.from(text.matchAll(/\{\{(\d+)\}\}/g));
  const indices = new Set(matches.map((m) => m[1]));
  return indices.size;
}

export async function createTemplateAction(input: unknown): Promise<CreateTemplateResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura credenciales de Meta en Configuración" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "input"}: ${issue.message}` };
  }
  const data = parsed.data;

  const bodyVars = countBodyVariables(data.bodyText);
  if (bodyVars > 0 && (data.bodyExample?.length ?? 0) < bodyVars) {
    return { ok: false, error: `El body tiene ${bodyVars} variable(s) pero faltan ejemplos` };
  }

  let header: Parameters<typeof createTemplate>[1]["header"];
  if (data.headerType === "TEXT" && data.headerText) {
    header = { type: "TEXT", text: data.headerText, example: data.headerExample };
  } else if (
    (data.headerType === "IMAGE" || data.headerType === "VIDEO" || data.headerType === "DOCUMENT") &&
    data.headerHandle
  ) {
    header = { type: data.headerType, handle: data.headerHandle };
  } else if (data.headerType !== "NONE" && data.headerType !== "TEXT") {
    return { ok: false, error: `Header ${data.headerType} requiere un archivo subido` };
  }

  try {
    const res = await createTemplate(creds, {
      name: data.name,
      language: data.language,
      category: data.category,
      header,
      body: { text: data.bodyText, example: data.bodyExample },
      footer: data.footerText ? { text: data.footerText } : undefined,
      buttons: data.buttons,
    });
    return { ok: true, id: res.id, status: res.status, name: data.name };
  } catch (e) {
    if (e instanceof MetaApiError) return { ok: false, error: e.message, code: e.code };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function goToPlantillasList() {
  redirect("/plantillas");
}

type CarouselCardPayload = {
  headerFormat: "IMAGE" | "VIDEO";
  handle: string;
  assetId: string;
  body: string;
  bodyExample: string;
  buttons: Array<
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string }
    | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  >;
};

export type CreateCarouselResult =
  | { ok: true; status: string; name: string }
  | { ok: false; error: string };

export async function createCarouselTemplateAction(input: {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  body: string;
  bodyExample: string;
  cards: CarouselCardPayload[];
}): Promise<CreateCarouselResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura tus credenciales de Meta primero" };

  if (input.cards.length < 2) return { ok: false, error: "El carrusel necesita al menos 2 tarjetas" };
  if (input.cards.some((c) => !c.handle || !c.assetId)) {
    return { ok: false, error: "Cada tarjeta necesita una imagen/video" };
  }

  const cards: CardInput[] = input.cards.map((c) => ({
    header: { format: c.headerFormat, handle: c.handle },
    body: { text: c.body, example: c.bodyExample ? [c.bodyExample] : undefined },
    buttons: c.buttons.map((b) =>
      b.type === "URL"
        ? { type: "URL", text: b.text, url: b.url }
        : b.type === "PHONE_NUMBER"
          ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number }
          : { type: "QUICK_REPLY", text: b.text },
    ),
  }));

  try {
    const res = await createTemplate(creds, {
      name: input.name,
      language: input.language,
      category: input.category,
      body: { text: input.body, example: input.bodyExample ? [input.bodyExample] : undefined },
      carousel: { cards },
    });

    // Clear existing card media rows for this template (re-submitting same name)
    await db
      .delete(templateCardMedia)
      .where(
        and(
          eq(templateCardMedia.orgId, orgId),
          eq(templateCardMedia.templateName, input.name),
          eq(templateCardMedia.templateLanguage, input.language),
        ),
      );

    // Insert new card media rows
    await db.insert(templateCardMedia).values(
      input.cards.map((c, i) => ({
        orgId,
        templateName: input.name,
        templateLanguage: input.language,
        cardIndex: i,
        assetId: c.assetId,
      })),
    );

    return { ok: true, status: res.status, name: input.name };
  } catch (e) {
    if (e instanceof MetaApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear" };
  }
}

export type CreateAuthResult =
  | { ok: true; id: string; status: string; name: string }
  | { ok: false; error: string; code?: number };

export async function createAuthTemplateAction(input: {
  name: string;
  language: string;
  buttonText: string;
  codeExpirationMinutes: number | null;
  addSecurityRecommendation: boolean;
}): Promise<CreateAuthResult> {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const creds = credsFromSettings(settings);
  if (!creds) return { ok: false, error: "Configura tus credenciales de Meta primero" };

  const parsed = nameSchema.safeParse(input.name);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Nombre: ${parsed.error.issues[0]?.message || "inválido"}`,
    };
  }

  if (!input.buttonText.trim()) {
    return { ok: false, error: "El texto del botón es obligatorio" };
  }

  if (input.codeExpirationMinutes !== null && (input.codeExpirationMinutes < 1 || input.codeExpirationMinutes > 90)) {
    return { ok: false, error: "La caducidad debe estar entre 1 y 90 minutos (o vacío)" };
  }

  try {
    const res = await createAuthTemplate(creds, {
      name: input.name,
      language: input.language,
      buttonText: input.buttonText,
      codeExpirationMinutes: input.codeExpirationMinutes,
      addSecurityRecommendation: input.addSecurityRecommendation,
    });
    return {
      ok: true,
      id: res.id,
      status: res.status,
      name: input.name,
    };
  } catch (e) {
    if (e instanceof MetaApiError) {
      return { ok: false, error: e.message, code: e.code };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear",
    };
  }
}
