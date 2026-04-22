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
