import { env } from "./env";

export type WhatsAppTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  text?: string;
  format?: string;
  example?: { body_text?: string[][]; header_text?: string[] };
  buttons?: Array<{ type: string; text: string; url?: string }>;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
  components: WhatsAppTemplateComponent[];
};

export type ChatwootContact = {
  id: number;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  thumbnail?: string | null;
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
  contact_inboxes?: Array<{
    source_id: string;
    inbox: { id: number };
  }>;
};

export type ChatwootMessage = {
  id: number;
  content: string | null;
  message_type: number;
  status: number;
  source_id: string | null;
  content_attributes?: {
    external_error?: string;
    [k: string]: unknown;
  };
  created_at: number;
};

export const MESSAGE_STATUS = {
  SENT: 0,
  DELIVERED: 1,
  READ: 2,
  FAILED: 3,
} as const;

export type ChatwootLabel = {
  id: number;
  title: string;
  description: string | null;
  color: string;
  show_on_sidebar: boolean;
};

export type ConversationStatus =
  | "open"
  | "resolved"
  | "pending"
  | "snoozed";

export type ChatwootConversation = {
  id: number;
  inbox_id: number;
  status: ConversationStatus;
  labels: string[];
  last_activity_at: number;
  created_at: number;
  meta: {
    sender: ChatwootContact;
    channel?: string;
  };
};

export type SignInResponse = {
  data: {
    id: number;
    name: string;
    email: string;
    access_token: string;
    role: "agent" | "administrator";
    account_id: number;
    available_name: string;
  };
};

class ChatwootError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ChatwootError";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function chatwoot<T>(
  path: string,
  init: RequestInit & { token?: string; userToken?: string } = {},
): Promise<T> {
  const { token, userToken, headers, ...rest } = init;
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  if (token) h.set("api_access_token", token);
  if (userToken) h.set("api_access_token", userToken);

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${env.CHATWOOT_BASE_URL}${path}`, {
      ...rest,
      headers: h,
      cache: "no-store",
    });

    const text = await res.text();
    const body = text ? safeJson(text) : null;

    if (res.ok) return body as T;

    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < maxAttempts - 1) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const backoff =
        retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await sleep(backoff);
      continue;
    }

    throw new ChatwootError(
      `Chatwoot ${res.status} ${path}`,
      res.status,
      body,
    );
  }
  throw new ChatwootError(`Chatwoot exhausted retries ${path}`, 0);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const chatwootApi = {
  signIn: (email: string, password: string) =>
    chatwoot<SignInResponse>("/auth/sign_in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getInbox: (token: string) =>
    chatwoot<{
      name: string;
      channel_type: string;
      message_templates: WhatsAppTemplate[];
    }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/inboxes/${env.CHATWOOT_INBOX_ID}`,
      { token },
    ),

  listTemplates: async (token: string) => {
    const inbox = await chatwootApi.getInbox(token);
    return inbox.message_templates ?? [];
  },

  searchContactByPhone: (token: string, phone: string) =>
    chatwoot<{ payload: ChatwootContact[] }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(phone)}&include=contact_inboxes`,
      { token },
    ),

  listContacts: (
    token: string,
    opts: { page?: number; q?: string } = {},
  ) => {
    const page = opts.page ?? 1;
    const params = new URLSearchParams({ page: String(page) });
    if (opts.q) params.set("q", opts.q);
    const endpoint = opts.q
      ? `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/contacts/search`
      : `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/contacts`;
    return chatwoot<{
      payload: ChatwootContact[];
      meta: { count: number; current_page: string };
    }>(`${endpoint}?${params.toString()}`, { token });
  },

  createContact: (
    token: string,
    data: { name: string; phone_number: string; inbox_id: number },
  ) =>
    chatwoot<{ payload: { contact: ChatwootContact } }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/contacts`,
      { method: "POST", token, body: JSON.stringify(data) },
    ),

  createContactInbox: (
    token: string,
    contactId: number,
    data: { inbox_id: number; source_id: string },
  ) =>
    chatwoot<{ id: number; source_id: string; inbox: { id: number } }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`,
      { method: "POST", token, body: JSON.stringify(data) },
    ),

  createConversation: (
    token: string,
    data: {
      source_id: string;
      inbox_id: number;
      contact_id: number;
    },
  ) =>
    chatwoot<{ id: number }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations`,
      { method: "POST", token, body: JSON.stringify(data) },
    ),

  sendTemplate: (
    token: string,
    conversationId: number,
    payload: {
      content?: string;
      template: {
        name: string;
        language: string;
        category: string;
        processed_params: Record<string, string>;
      };
    },
  ) =>
    chatwoot<{ id: number; status: string }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        token,
        body: JSON.stringify({
          content: payload.content ?? "",
          message_type: "outgoing",
          template_params: payload.template,
        }),
      },
    ),

  listConversationMessages: (token: string, conversationId: number) =>
    chatwoot<{ payload: ChatwootMessage[] }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      { token },
    ),

  listLabels: (token: string) =>
    chatwoot<{ payload: ChatwootLabel[] }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/labels`,
      { token },
    ),

  listConversations: (
    token: string,
    opts: {
      status?: ConversationStatus | "all";
      labels?: string[];
      inboxId?: number;
      page?: number;
    } = {},
  ) => {
    const p = new URLSearchParams();
    p.set("status", opts.status ?? "all");
    if (opts.inboxId) p.set("inbox_id", String(opts.inboxId));
    if (opts.page) p.set("page", String(opts.page));
    for (const l of opts.labels ?? []) p.append("labels[]", l);
    return chatwoot<{
      data: {
        meta: {
          all_count: number;
          mine_count: number;
          assigned_count: number;
          unassigned_count: number;
        };
        payload: ChatwootConversation[];
      };
    }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations?${p.toString()}`,
      { token },
    );
  },

  addLabelsToConversation: (
    token: string,
    conversationId: number,
    labels: string[],
  ) =>
    chatwoot<{ payload: string[] }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/labels`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ labels }),
      },
    ),

  toggleConversationStatus: (
    token: string,
    conversationId: number,
    status: ConversationStatus,
  ) =>
    chatwoot<{ meta: unknown; payload: ChatwootConversation }>(
      `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/toggle_status`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ status }),
      },
    ),
};

export { ChatwootError };
