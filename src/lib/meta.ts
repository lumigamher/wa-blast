import { requireMetaAppId, requireMetaConfig, requireMetaPhoneId } from "./env";

const GRAPH_API = "https://graph.facebook.com/v20.0";

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type ButtonSpec =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string };

export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export type HeaderSpec =
  | { type: "TEXT"; text: string; example?: string[] }
  | { type: MediaFormat; handle: string };

export type CreateTemplateInput = {
  name: string;
  language: string;
  category: TemplateCategory;
  header?: HeaderSpec;
  body: { text: string; example?: string[] };
  footer?: { text: string };
  buttons?: ButtonSpec[];
};

export type CreateTemplateResponse = {
  id: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
  category?: string;
};

export class MetaApiError extends Error {
  constructor(
    public code: number,
    public subcode: number | undefined,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = requireMetaConfig();
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } } | null)
      ?.error;
    throw new MetaApiError(
      err?.code ?? res.status,
      err?.error_subcode,
      body,
      err?.message ?? `Meta ${res.status}`,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildComponents(input: CreateTemplateInput) {
  const components: Array<Record<string, unknown>> = [];

  if (input.header) {
    if (input.header.type === "TEXT") {
      const comp: Record<string, unknown> = {
        type: "HEADER",
        format: "TEXT",
        text: input.header.text,
      };
      const hasVar = /\{\{\d+\}\}/.test(input.header.text);
      if (hasVar && input.header.example?.length) {
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

  const bodyComp: Record<string, unknown> = {
    type: "BODY",
    text: input.body.text,
  };
  const bodyHasVars = /\{\{\d+\}\}/.test(input.body.text);
  if (bodyHasVars && input.body.example?.length) {
    bodyComp.example = { body_text: [input.body.example] };
  }
  components.push(bodyComp);

  if (input.footer) {
    components.push({ type: "FOOTER", text: input.footer.text });
  }

  if (input.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((b) => {
        if (b.type === "URL") {
          return { type: "URL", text: b.text, url: b.url };
        }
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  return components;
}

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
  category: string;
  components: Array<{
    type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
    format?: string;
    text?: string;
    example?: { body_text?: string[][]; header_text?: string[] };
    buttons?: Array<{ type: string; text: string; url?: string }>;
  }>;
};

async function requestAll<T>(startPath: string): Promise<T[]> {
  const results: T[] = [];
  let path: string = startPath;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await request<{
      data: T[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(path);
    results.push(...(res.data ?? []));
    const nextFull = res.paging?.next;
    if (!nextFull || results.length > 500) break;
    const u = new URL(nextFull);
    path = `${u.pathname}${u.search}`.replace(/^\/v\d+\.\d+/, "");
  }
  return results;
}

export type MessagingTier =
  | "TIER_50"
  | "TIER_250"
  | "TIER_1K"
  | "TIER_10K"
  | "TIER_100K"
  | "TIER_UNLIMITED";

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

export type ConversationAnalyticsPoint = {
  start: number;
  end: number;
  conversation: number;
  cost?: number;
  conversation_category?:
    | "UTILITY"
    | "MARKETING"
    | "AUTHENTICATION"
    | "SERVICE"
    | "REFERRAL_CONVERSION";
  conversation_direction?: "BUSINESS_INITIATED" | "USER_INITIATED";
  conversation_type?: string;
  phone_number?: string;
};

export const TIER_LIMITS: Record<MessagingTier, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

async function uploadMedia(
  bytes: ArrayBuffer,
  opts: { fileName: string; mimeType: string },
): Promise<string> {
  const { accessToken } = requireMetaConfig();
  const appId = requireMetaAppId();
  const length = bytes.byteLength;

  const startUrl = new URL(`${GRAPH_API}/${appId}/uploads`);
  startUrl.searchParams.set("file_name", opts.fileName);
  startUrl.searchParams.set("file_length", String(length));
  startUrl.searchParams.set("file_type", opts.mimeType);
  startUrl.searchParams.set("access_token", accessToken);

  const startRes = await fetch(startUrl, { method: "POST", cache: "no-store" });
  const startText = await startRes.text();
  const startBody = startText ? safeJson(startText) : null;
  if (!startRes.ok) {
    const err = (startBody as { error?: { message?: string; code?: number; error_subcode?: number } } | null)
      ?.error;
    throw new MetaApiError(
      err?.code ?? startRes.status,
      err?.error_subcode,
      startBody,
      err?.message ?? `Meta upload start ${startRes.status}`,
    );
  }
  const sessionId = (startBody as { id?: string } | null)?.id;
  if (!sessionId) {
    throw new MetaApiError(0, undefined, startBody, "Sesión de upload sin id");
  }

  const uploadRes = await fetch(`${GRAPH_API}/${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
    },
    body: bytes,
    cache: "no-store",
  });
  const uploadText = await uploadRes.text();
  const uploadBody = uploadText ? safeJson(uploadText) : null;
  if (!uploadRes.ok) {
    const err = (uploadBody as { error?: { message?: string; code?: number; error_subcode?: number } } | null)
      ?.error;
    throw new MetaApiError(
      err?.code ?? uploadRes.status,
      err?.error_subcode,
      uploadBody,
      err?.message ?? `Meta upload bytes ${uploadRes.status}`,
    );
  }
  const handle = (uploadBody as { h?: string } | null)?.h;
  if (!handle) {
    throw new MetaApiError(0, undefined, uploadBody, "Upload sin handle (h)");
  }
  return handle;
}

export const MEDIA_LIMITS = {
  IMAGE: { bytes: 5 * 1024 * 1024, mime: ["image/jpeg", "image/png"] },
  VIDEO: { bytes: 16 * 1024 * 1024, mime: ["video/mp4", "video/3gpp"] },
  DOCUMENT: { bytes: 100 * 1024 * 1024, mime: ["application/pdf"] },
} as const;

export const metaApi = {
  uploadMedia,

  createTemplate(
    input: CreateTemplateInput,
  ): Promise<CreateTemplateResponse> {
    const { wabaId } = requireMetaConfig();
    return request(`/${wabaId}/message_templates`, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        language: input.language,
        category: input.category,
        // Meta reclasifica a MARKETING si el contenido suena promocional,
        // a menos que le digamos explícitamente que no.
        allow_category_change: false,
        components: buildComponents(input),
      }),
    });
  },

  listTemplates(): Promise<MetaTemplate[]> {
    const { wabaId } = requireMetaConfig();
    return requestAll<MetaTemplate>(
      `/${wabaId}/message_templates?limit=100&fields=name,status,language,category,components,id`,
    );
  },

  getPhoneHealth(): Promise<PhoneHealth> {
    const phoneId = requireMetaPhoneId();
    const fields =
      "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,name_status,code_verification_status";
    return request<PhoneHealth>(`/${phoneId}?fields=${fields}`);
  },

  getConversationAnalytics(opts: {
    startEpoch: number;
    endEpoch: number;
    granularity?: "HALF_HOUR" | "DAILY" | "MONTHLY";
  }): Promise<{
    conversation_analytics: {
      data: Array<{ data_points: ConversationAnalyticsPoint[] }>;
    };
  }> {
    const { wabaId } = requireMetaConfig();
    const gran = opts.granularity ?? "DAILY";
    const query = `conversation_analytics.start(${opts.startEpoch}).end(${opts.endEpoch}).granularity(${gran}).dimensions(["CONVERSATION_CATEGORY","CONVERSATION_DIRECTION"])`;
    return request(`/${wabaId}?fields=${encodeURIComponent(query)}`);
  },
};

export { countBodyVariables, listBodyVariableIndices } from "./template-vars";
