import type { ButtonSpec, CardInput, CreateTemplateInput, MediaFormat, WhatsAppTemplate } from "./types";

const GRAPH_API = "https://graph.facebook.com/v22.0";

export type GraphCreds = {
  accessToken: string;
  wabaId: string;
  phoneId: string;
  appId?: string;
};

export class MetaApiError extends Error {
  constructor(
    public code: number,
    public subcode: number | undefined,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

async function request<T>(creds: GraphCreds, path: string, init: RequestInit = {}): Promise<T> {
  const url = `${GRAPH_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${creds.accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } } | null)?.error;
    throw new MetaApiError(err?.code ?? res.status, err?.error_subcode, body, err?.message ?? `Meta ${res.status}`);
  }
  return body as T;
}

async function requestAll<T>(creds: GraphCreds, startPath: string): Promise<T[]> {
  const results: T[] = [];
  let path: string = startPath;
  while (true) {
    const res = await request<{ data: T[]; paging?: { next?: string } }>(creds, path);
    results.push(...(res.data ?? []));
    const nextFull = res.paging?.next;
    if (!nextFull || results.length > 500) break;
    const u = new URL(nextFull);
    path = `${u.pathname}${u.search}`.replace(/^\/v\d+\.\d+/, "");
  }
  return results;
}

export async function listTemplates(creds: GraphCreds): Promise<WhatsAppTemplate[]> {
  return requestAll<WhatsAppTemplate>(
    creds,
    `/${creds.wabaId}/message_templates?limit=100&fields=name,status,language,category,components,id`,
  );
}

export async function deleteTemplate(creds: GraphCreds, name: string): Promise<void> {
  await request(creds, `/${creds.wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

function metaButton(b: ButtonSpec): Record<string, unknown> {
  if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
  if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
  if (b.type === "FLOW") return { type: "FLOW", text: b.text, flow_id: b.flow_id };
  const out: Record<string, unknown> = { type: "URL", text: b.text, url: b.url };
  if (/\{\{\d+\}\}/.test(b.url) && b.example?.length) out.example = b.example;
  return out;
}

export function validateCarousel(cards: CardInput[]): void {
  if (cards.length < 2 || cards.length > 10) {
    throw new Error("El carrusel debe tener entre 2 y 10 tarjetas");
  }
  const fmt = cards[0].header.format;
  const sig = (c: CardInput) => c.buttons.map((b) => b.type).join(",");
  const sig0 = sig(cards[0]);
  for (const c of cards) {
    if (c.header.format !== fmt) throw new Error("Todas las tarjetas deben usar el mismo formato de header (IMAGE o VIDEO)");
    if (sig(c) !== sig0) throw new Error("Todas las tarjetas deben tener la misma estructura de buttons");
  }
}

function buildCardComponents(card: CardInput): Array<Record<string, unknown>> {
  const comps: Array<Record<string, unknown>> = [
    { type: "HEADER", format: card.header.format, example: { header_handle: [card.header.handle] } },
  ];
  const body: Record<string, unknown> = { type: "BODY", text: card.body.text };
  if (/\{\{\d+\}\}/.test(card.body.text) && card.body.example?.length) {
    body.example = { body_text: [card.body.example] };
  }
  comps.push(body);
  if (card.buttons.length) {
    comps.push({ type: "BUTTONS", buttons: card.buttons.map(metaButton) });
  }
  return comps;
}

export function buildCreateComponents(input: CreateTemplateInput) {
  const components: Array<Record<string, unknown>> = [];

  if (input.header) {
    if (input.header.type === "TEXT") {
      const comp: Record<string, unknown> = { type: "HEADER", format: "TEXT", text: input.header.text };
      if (/\{\{\d+\}\}/.test(input.header.text) && input.header.example?.length) {
        comp.example = { header_text: input.header.example };
      }
      components.push(comp);
    } else {
      components.push({
        type: "HEADER",
        format: input.header.type,
        example: { header_handle: [input.header.handle] },
      });
    }
  }

  const bodyComp: Record<string, unknown> = { type: "BODY", text: input.body.text };
  if (/\{\{\d+\}\}/.test(input.body.text) && input.body.example?.length) {
    bodyComp.example = { body_text: [input.body.example] };
  }
  components.push(bodyComp);

  if (input.footer) components.push({ type: "FOOTER", text: input.footer.text });

  if (input.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map(metaButton),
    });
  }

  if (input.carousel?.cards?.length) {
    validateCarousel(input.carousel.cards);
    components.push({ type: "CAROUSEL", cards: input.carousel.cards.map((c) => ({ components: buildCardComponents(c) })) });
  }

  return components;
}

export async function createTemplate(
  creds: GraphCreds,
  input: CreateTemplateInput,
): Promise<{ id: string; status: string; category?: string }> {
  return request(creds, `/${creds.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      allow_category_change: false,
      components: buildCreateComponents(input),
    }),
  });
}

export const MEDIA_LIMITS: Record<MediaFormat, { maxBytes: number; mimes: string[] }> = {
  IMAGE: { maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png"] },
  VIDEO: { maxBytes: 16 * 1024 * 1024, mimes: ["video/mp4", "video/3gpp"] },
  DOCUMENT: { maxBytes: 100 * 1024 * 1024, mimes: ["application/pdf"] },
};

export async function uploadMedia(
  creds: GraphCreds,
  bytes: ArrayBuffer,
  opts: { fileName: string; mimeType: string },
): Promise<string> {
  if (!creds.appId) throw new Error("META_APP_ID must be set for media upload");
  const length = bytes.byteLength;

  const startUrl = new URL(`${GRAPH_API}/${creds.appId}/uploads`);
  startUrl.searchParams.set("file_name", opts.fileName);
  startUrl.searchParams.set("file_length", String(length));
  startUrl.searchParams.set("file_type", opts.mimeType);
  startUrl.searchParams.set("access_token", creds.accessToken);

  const startRes = await fetch(startUrl, { method: "POST", cache: "no-store" });
  const startText = await startRes.text();
  const startBody = startText ? safeJson(startText) : null;
  if (!startRes.ok) {
    const err = (startBody as { error?: { message?: string; code?: number } } | null)?.error;
    throw new MetaApiError(err?.code ?? startRes.status, undefined, startBody, err?.message ?? "upload start failed");
  }
  const sessionId = (startBody as { id?: string } | null)?.id;
  if (!sessionId) throw new MetaApiError(0, undefined, startBody, "no upload session id");

  const uploadRes = await fetch(`${GRAPH_API}/${sessionId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${creds.accessToken}`, file_offset: "0" },
    body: bytes,
    cache: "no-store",
  });
  const uploadText = await uploadRes.text();
  const uploadBody = uploadText ? safeJson(uploadText) : null;
  if (!uploadRes.ok) {
    const err = (uploadBody as { error?: { message?: string; code?: number } } | null)?.error;
    throw new MetaApiError(err?.code ?? uploadRes.status, undefined, uploadBody, err?.message ?? "upload failed");
  }
  const handle = (uploadBody as { h?: string } | null)?.h;
  if (!handle) throw new MetaApiError(0, undefined, uploadBody, "no handle returned");
  return handle;
}

export type MessagingTier = "TIER_50" | "TIER_250" | "TIER_1K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED";
export type QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export type PhoneHealth = {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: QualityRating;
  messaging_limit_tier?: MessagingTier;
  throughput?: { level?: "STANDARD" | "HIGH" };
  name_status?: string;
  code_verification_status?: string;
};

export const TIER_LIMITS: Record<MessagingTier, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

export async function getPhoneHealth(creds: GraphCreds): Promise<PhoneHealth> {
  return request<PhoneHealth>(
    creds,
    `/${creds.phoneId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,name_status,code_verification_status`,
  );
}

export function credsFromSettings(settings: {
  metaAccessToken: string | null;
  metaWabaId: string | null;
  metaPhoneId: string | null;
  metaAppId: string | null;
}): GraphCreds | null {
  if (!settings.metaAccessToken || !settings.metaWabaId || !settings.metaPhoneId) return null;
  return {
    accessToken: settings.metaAccessToken,
    wabaId: settings.metaWabaId,
    phoneId: settings.metaPhoneId,
    appId: settings.metaAppId ?? process.env.META_APP_ID,
  };
}
