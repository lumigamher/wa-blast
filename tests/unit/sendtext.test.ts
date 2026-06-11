import { describe, expect, it, vi, afterEach } from "vitest";
import type { DecryptedSettings } from "@/lib/org/settings";
import { sendText } from "@/lib/meta/client";

const mockSettings = {
  metaPhoneId: "123456789",
  metaAccessToken: "test_token_xyz",
} as DecryptedSettings;

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendText", () => {
  it("returns error if creds not configured", async () => {
    const result = await sendText({ metaPhoneId: "", metaAccessToken: "" } as DecryptedSettings, {
      to: "+573001112233",
      body: "hola",
    });
    expect(result).toMatchObject({ error: { type: "auth" } });
  });

  it("sends text with correct payload", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.ABC123" }] }),
    });

    const result = await sendText(mockSettings, { to: "+573001112233", body: "hola mundo" });

    expect(result).toMatchObject({ wamid: "wamid.ABC123" });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("v22.0/123456789/messages"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test_token_xyz",
          "content-type": "application/json",
        }),
        body: expect.stringContaining('"type":"text"'),
      }),
    );
    const call = fetchSpy.mock.calls[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callBody = JSON.parse((call[1] as any)?.body);
    expect(callBody).toMatchObject({
      messaging_product: "whatsapp",
      to: "573001112233",
      type: "text",
      text: { body: "hola mundo" },
    });
  });

  it("strips leading + from phone number", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.XYZ" }] }),
    });

    await sendText(mockSettings, { to: "+573001112233", body: "test" });

    const call = fetchSpy.mock.calls[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callBody = JSON.parse((call[1] as any)?.body);
    expect(callBody.to).toBe("573001112233");
  });

  it("classifies error 131047 as outside_24h", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: 131047, message: "Message outside the window" } }),
    });

    const result = await sendText(mockSettings, { to: "+573001112233", body: "test" });

    expect(result).toMatchObject({ error: { code: 131047, type: "outside_24h" } });
  });

  it("handles fetch error gracefully", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const result = await sendText(mockSettings, { to: "+573001112233", body: "test" });

    expect(result).toMatchObject({ error: { type: "unknown" } });
  });
});
