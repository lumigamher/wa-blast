import type { DecryptedSettings } from "@/lib/org/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markRead, sendMedia, sendReaction, uploadMedia } from "@/lib/meta/client";

const settings = { metaPhoneId: "PHONE1", metaAccessToken: "TOK" } as unknown as DecryptedSettings;
afterEach(() => vi.restoreAllMocks());

describe("meta client inbox methods", () => {
  it("markRead manda status read + typing_indicator", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const r = await markRead(settings, { wamid: "wamid.X", typing: true });
    expect(r).toEqual({ ok: true });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ messaging_product: "whatsapp", status: "read", message_id: "wamid.X", typing_indicator: { type: "text" } });
    expect(String(mock.mock.calls[0][0])).toContain("/PHONE1/messages");
  });

  it("markRead sin typing omite typing_indicator", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await markRead(settings, { wamid: "w1" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body.typing_indicator).toBeUndefined();
  });

  it("uploadMedia sube bytes y devuelve media_id", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "MEDIA99" }), { status: 200 }));
    const r = await uploadMedia(settings, { bytes: new ArrayBuffer(8), mime: "image/png", filename: "x.png" });
    expect(r).toEqual({ mediaId: "MEDIA99" });
    expect(String(mock.mock.calls[0][0])).toContain("/PHONE1/media");
  });

  it("sendMedia arma type image con media_id y caption", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] }), { status: 200 }));
    const r = await sendMedia(settings, { to: "+573001112233", kind: "image", mediaId: "MEDIA99", caption: "mira" });
    expect(r).toEqual({ wamid: "wamid.OUT" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ type: "image", image: { id: "MEDIA99", caption: "mira" } });
    expect(body.to).toBe("573001112233");
  });

  it("sendMedia con replyTo incluye context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 }));
    const r = await sendMedia(settings, { to: "+57300", kind: "document", mediaId: "M", replyTo: "wamid.PREV" });
    expect("wamid" in r).toBe(true);
  });

  it("sendReaction arma type reaction", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 }));
    await sendReaction(settings, { to: "+573001112233", wamid: "wamid.MSG", emoji: "👍" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ type: "reaction", reaction: { message_id: "wamid.MSG", emoji: "👍" } });
  });

  it("error de Meta se clasifica", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: 131047, message: "re-engagement" } }), { status: 400 }));
    const r = await sendMedia(settings, { to: "+57300", kind: "image", mediaId: "M" });
    expect("error" in r && r.error.type).toBe("outside_24h");
  });
});
