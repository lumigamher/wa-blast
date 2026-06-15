import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMedia } from "@/lib/meta/client";
import type { DecryptedSettings } from "@/lib/org/settings";

const settings = { metaPhoneId: "PHONE1", metaAccessToken: "TOK" } as unknown as DecryptedSettings;
afterEach(() => vi.restoreAllMocks());

describe("sendMedia sticker", () => {
  it("arma type sticker con media_id y sin caption", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.S" }] }), { status: 200 }));
    const r = await sendMedia(settings, { to: "+57300", kind: "sticker", mediaId: "M", caption: "ignored" });
    expect(r).toEqual({ wamid: "wamid.S" });
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body.type).toBe("sticker");
    expect(body.sticker).toEqual({ id: "M" });
  });
});
