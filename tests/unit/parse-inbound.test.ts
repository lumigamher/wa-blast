import { describe, expect, it } from "vitest";
import { parseInboundMessage } from "@/lib/inbox/parse-inbound";

const base = { from: "573001112233", id: "wamid.X", timestamp: "1760000000" };

describe("parseInboundMessage", () => {
  it("texto", () => {
    const r = parseInboundMessage({ ...base, type: "text", text: { body: "hola" } });
    expect(r).toMatchObject({ type: "text", body: "hola", mediaId: null });
  });
  it("imagen con caption", () => {
    const r = parseInboundMessage({ ...base, type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "mira" } });
    expect(r).toMatchObject({ type: "image", body: "mira", mediaId: "MEDIA1" });
  });
  it("captura url/mime del media cuando Meta los incluye en el webhook", () => {
    const r = parseInboundMessage({ ...base, type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", url: "https://lookaside.fbsbx.com/x?source=webhook" } });
    expect(r.mediaUrl).toBe("https://lookaside.fbsbx.com/x?source=webhook");
    expect(r.mediaMime).toBe("image/jpeg");
  });
  it("audio/video/document/sticker llevan mediaId", () => {
    for (const t of ["audio", "video", "document", "sticker"] as const) {
      const r = parseInboundMessage({ ...base, type: t, [t]: { id: "M2", mime_type: "x/y" } });
      expect(r.mediaId).toBe("M2");
      expect(r.type).toBe(t);
    }
  });
  it("document usa filename como body", () => {
    const r = parseInboundMessage({ ...base, type: "document", document: { id: "M3", filename: "factura.pdf" } });
    expect(r.body).toBe("factura.pdf");
  });
  it("interactive button_reply / list_reply", () => {
    const r = parseInboundMessage({ ...base, type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b1", title: "Sí, agendar" } } });
    expect(r).toMatchObject({ type: "interactive", body: "Sí, agendar" });
    const r2 = parseInboundMessage({ ...base, type: "interactive", interactive: { type: "list_reply", list_reply: { id: "l1", title: "Martes 10am" } } });
    expect(r2.body).toBe("Martes 10am");
  });
  it("interactive nfm_reply (flow) resume y conserva raw", () => {
    const r = parseInboundMessage({ ...base, type: "interactive", interactive: { type: "nfm_reply", nfm_reply: { response_json: '{"nombre":"Ana"}', name: "flow" } } });
    expect(r.type).toBe("flow");
    expect(r.body).toContain("Formulario");
    expect(r.payloadJson).toContain("nombre");
  });
  it("button (quick reply de plantilla)", () => {
    const r = parseInboundMessage({ ...base, type: "button", button: { text: "Confirmar", payload: "CONF" } });
    expect(r.body).toBe("Confirmar");
  });
  it("reaction", () => {
    const r = parseInboundMessage({ ...base, type: "reaction", reaction: { emoji: "👍", message_id: "wamid.prev" } });
    expect(r).toMatchObject({ type: "reaction", body: "👍" });
  });
  it("desconocido → unknown con raw", () => {
    const r = parseInboundMessage({ ...base, type: "order", order: { x: 1 } });
    expect(r.type).toBe("unknown");
    expect(r.payloadJson).toBeTruthy();
  });
  it("parsea un mensaje de ubicación", () => {
    const r = parseInboundMessage({ ...base, type: "location", location: { latitude: 4.6, longitude: -74.1, name: "Casa", address: "Cra 1 #2-3, Bogotá" } });
    expect(r.type).toBe("location");
    expect(r.body).toContain("Ubicación");
    expect(r.body).toContain("Casa");
    expect(r.payloadJson).toContain("4.6");
  });
  it("ubicación sin nombre usa la dirección o las coordenadas", () => {
    const r = parseInboundMessage({ ...base, type: "location", location: { latitude: 1, longitude: 2 } });
    expect(r.body).toContain("1");
    expect(r.body).toContain("2");
  });
});
