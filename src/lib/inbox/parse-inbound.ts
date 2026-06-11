export type ParsedInbound = {
  type: string; // text|image|video|audio|document|sticker|reaction|interactive|flow|button|unknown
  body: string | null;
  mediaId: string | null;
  payloadJson: string | null;
};

type AnyMsg = Record<string, any>;
const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;

export function parseInboundMessage(msg: AnyMsg): ParsedInbound {
  const raw = JSON.stringify(msg);
  if (msg.type === "text") return { type: "text", body: msg.text?.body ?? "", mediaId: null, payloadJson: null };
  if ((MEDIA_TYPES as readonly string[]).includes(msg.type)) {
    const m = msg[msg.type] ?? {};
    const body = m.caption ?? m.filename ?? null;
    return { type: msg.type, body, mediaId: m.id ?? null, payloadJson: raw };
  }
  if (msg.type === "interactive") {
    const i = msg.interactive ?? {};
    if (i.type === "button_reply") return { type: "interactive", body: i.button_reply?.title ?? "", mediaId: null, payloadJson: raw };
    if (i.type === "list_reply") return { type: "interactive", body: i.list_reply?.title ?? "", mediaId: null, payloadJson: raw };
    if (i.type === "nfm_reply") {
      let resumen = "Formulario completado";
      try {
        const data = JSON.parse(i.nfm_reply?.response_json ?? "{}");
        const campos = Object.entries(data).filter(([k]) => k !== "flow_token").map(([k, v]) => `${k}: ${v}`).slice(0, 6);
        if (campos.length) resumen = `Formulario completado — ${campos.join(" · ")}`;
      } catch { /* raw queda en payloadJson */ }
      return { type: "flow", body: resumen, mediaId: null, payloadJson: raw };
    }
    return { type: "interactive", body: null, mediaId: null, payloadJson: raw };
  }
  if (msg.type === "button") return { type: "button", body: msg.button?.text ?? "", mediaId: null, payloadJson: raw };
  if (msg.type === "reaction") return { type: "reaction", body: msg.reaction?.emoji ?? "", mediaId: null, payloadJson: raw };
  return { type: "unknown", body: null, mediaId: null, payloadJson: raw };
}
