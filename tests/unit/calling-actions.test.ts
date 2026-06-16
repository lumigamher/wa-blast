import { describe, expect, it, vi, beforeEach } from "vitest";
import { acceptCall, placeCall, rejectCall, requestCallPermission, terminateCall } from "@/lib/meta/calling";
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
  it("requestCallPermission postea mensaje interactivo call_permission_request", async () => {
    const fetchFn = mockFetchOk();
    const res = await requestCallPermission(s, "+57300");
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/PID/messages");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("+57300");
    expect(body.type).toBe("interactive");
    expect(body.interactive.type).toBe("call_permission_request");
  });
  it("placeCall postea action connect con offer y devuelve callId", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ calls: [{ id: "CID-OUT" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const res = await placeCall(s, "v=0 offer", "+57300");
    expect(res).toEqual({ ok: true, callId: "CID-OUT" });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe("connect");
    expect(body.to).toBe("+57300");
    expect(body.session).toEqual({ sdp: "v=0 offer", sdp_type: "offer" });
  });
});
