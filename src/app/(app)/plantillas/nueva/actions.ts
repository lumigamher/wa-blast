"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { metaApi, MetaApiError, countBodyVariables } from "@/lib/meta";
import { getSession } from "@/lib/session";

const nameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "Usa solo minúsculas, números y guiones bajos");

const variableListSchema = z
  .array(z.string().min(1))
  .max(20);

const buttonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("QUICK_REPLY"),
    text: z.string().min(1).max(25),
  }),
  z.object({
    type: z.literal("URL"),
    text: z.string().min(1).max(25),
    url: z.string().url(),
  }),
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

export async function createTemplateAction(
  input: unknown,
): Promise<CreateTemplateResult> {
  const session = await getSession();
  if (!session.user) return { ok: false, error: "No autenticado" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `${issue.path.join(".") || "input"}: ${issue.message}`,
    };
  }

  const data = parsed.data;

  const bodyVars = countBodyVariables(data.bodyText);
  if (bodyVars > 0 && (data.bodyExample?.length ?? 0) < bodyVars) {
    return {
      ok: false,
      error: `El body tiene ${bodyVars} variable(s) pero faltan ejemplos`,
    };
  }

  let header: Parameters<typeof metaApi.createTemplate>[0]["header"];
  if (data.headerType === "TEXT" && data.headerText) {
    header = {
      type: "TEXT",
      text: data.headerText,
      example: data.headerExample,
    };
  } else if (
    (data.headerType === "IMAGE" ||
      data.headerType === "VIDEO" ||
      data.headerType === "DOCUMENT") &&
    data.headerHandle
  ) {
    header = { type: data.headerType, handle: data.headerHandle };
  } else if (data.headerType !== "NONE" && data.headerType !== "TEXT") {
    return {
      ok: false,
      error: `Header ${data.headerType} requiere un archivo subido`,
    };
  }

  try {
    const res = await metaApi.createTemplate({
      name: data.name,
      language: data.language,
      category: data.category,
      header,
      body: {
        text: data.bodyText,
        example: data.bodyExample,
      },
      footer: data.footerText ? { text: data.footerText } : undefined,
      buttons: data.buttons,
    });
    return {
      ok: true,
      id: res.id,
      status: res.status,
      name: data.name,
    };
  } catch (e) {
    if (e instanceof MetaApiError) {
      return { ok: false, error: e.message, code: e.code };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function goToPlantillasList() {
  redirect("/plantillas");
}
