import { describe, expect, test, vi } from "vitest";
import { forwardWebhook } from "@/lib/meta/forward";

describe("forwardWebhook", () => {
  test("succeeds on first try", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    await forwardWebhook(
      fetchSpy as unknown as typeof fetch,
      "https://x",
      '{"a":1}',
      { "x-hub-signature-256": "s" },
      0,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("retries on 500 up to 3 times", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await forwardWebhook(fetchSpy as unknown as typeof fetch, "https://x", "{}", {}, 0);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
