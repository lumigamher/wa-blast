export type WhatsAppButton = {
  type: string; // QUICK_REPLY | URL | PHONE_NUMBER
  text: string;
  url?: string;
  phone_number?: string;
};

export type WhatsAppCard = {
  components: WhatsAppTemplateComponent[];
};

export type WhatsAppTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS" | "CAROUSEL";
  text?: string;
  format?: string;
  example?: { body_text?: string[][]; header_text?: string[]; header_handle?: string[] };
  buttons?: WhatsAppButton[];
  cards?: WhatsAppCard[];
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
  | { type: "URL"; text: string; url: string; example?: string[] }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export type HeaderSpec =
  | { type: "TEXT"; text: string; example?: string[] }
  | { type: MediaFormat; handle: string };

export type CardInput = {
  header: { format: "IMAGE" | "VIDEO"; handle: string };
  body: { text: string; example?: string[] };
  buttons: ButtonSpec[];
};

export type CreateTemplateInput = {
  name: string;
  language: string;
  category: TemplateCategory;
  header?: HeaderSpec;
  body: { text: string; example?: string[] };
  footer?: { text: string };
  buttons?: ButtonSpec[];
  carousel?: { cards: CardInput[] };
};
