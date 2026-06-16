import { describe, expect, it, vi, beforeEach } from "vitest";
import { acceptCall, rejectCall, terminateCall } from "@/lib/meta/calling";
import type { DecryptedSettings } from "@/lib/org/settings";

const s = { metaPhoneId: "PID", metaAccessToken: "TOK" } as DecryptedSettings;

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOk() {
  const fn = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("calling actions", () => {
  it("acceptCall postea action accept con session answer", async () => {
    const fetchFn = mockFetchOk();
    const res = await acceptCall(s, "CID", "v=0 answer");
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/PID/calls");
    expect(JSON.parse(init.body as string)).toEqual({
      call_id: "CID",
      action: "accept",
      session: { sdp: "v=0 answer", sdp_type: "answer" },
    });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer TOK");
  });
  it("rejectCall y terminateCall postean su action sin session", async () => {
    const fetchFn = mockFetchOk();
    await rejectCall(s, "CID");
    expect(JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string)).toEqual({ call_id: "CID", action: "reject" });
    await terminateCall(s, "CID");
    expect(JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string)).toEqual({ call_id: "CID", action: "terminate" });
  });
  it("sin creds Meta devuelve error", async () => {
    const res = await acceptCall({ metaPhoneId: null, metaAccessToken: null } as DecryptedSettings, "CID", "x");
    expect(res).toHaveProperty("error");
  });
});
