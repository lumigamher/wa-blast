import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildIceServers } from "@/lib/calls/ice";

describe("buildIceServers", () => {
  it("sin TURN configurado devuelve solo STUN público", () => {
    const servers = buildIceServers({ turnUrl: undefined, turnSecret: undefined, nowSec: 1000 });
    expect(servers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });
  it("con TURN genera credencial efímera HMAC-SHA1", () => {
    const servers = buildIceServers({ turnUrl: "turn:turn.luladev.com:3478", turnSecret: "shh", nowSec: 1000, ttlSec: 3600 });
    const turn = servers.find((s) => String(s.urls).startsWith("turn:"))!;
    const expectedUser = "4600"; // 1000 + 3600
    const expectedCred = createHmac("sha1", "shh").update(expectedUser).digest("base64");
    expect(turn.username).toBe(expectedUser);
    expect(turn.credential).toBe(expectedCred);
    expect(servers.some((s) => String(s.urls).startsWith("stun:"))).toBe(true);
  });
  it("incluye turns: con la misma credencial cuando se pasa turnTlsUrl", () => {
    const servers = buildIceServers({
      turnUrl: "turn:1.2.3.4:3478",
      turnTlsUrl: "turns:luladev.com:5349",
      turnSecret: "shh",
      nowSec: 1000,
      ttlSec: 3600,
    });
    const turn = servers.find((s) => String(s.urls).startsWith("turn:"))!;
    const turns = servers.find((s) => String(s.urls).startsWith("turns:"))!;
    expect(turns).toBeTruthy();
    expect(turns.username).toBe(turn.username);
    expect(turns.credential).toBe(turn.credential);
  });
});
