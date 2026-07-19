import { describe, expect, it, vi } from "vitest";
import { sendText } from "@/lib/meta/client";
import type { DecryptedSettings } from "@/lib/org/settings";

const settings: DecryptedSettings = {
  metaPhoneId: "P",
  metaAccessToken: "T",
} as never;

describe("timeouts hacia Meta", () => {
  it("sendText pasa un AbortSignal al fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }),
    );
    await sendText(settings, { to: "+573001112233", body: "hola" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    fetchMock.mockRestore();
  });
});
