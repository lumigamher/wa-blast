import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";

describe("isPublicPath", () => {
  it("permite la raíz y las rutas públicas exactas y sus subrutas", () => {
    for (const p of ["/", "/login", "/signup", "/api/auth/session", "/api/webhook/meta", "/api/cron/run-scheduled", "/media/abc-123", "/shots/panel.png"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });
  it("NO permite rutas que solo comparten prefijo", () => {
    for (const p of ["/api/webhook-admin", "/api/cronx", "/mediaX", "/loginfake", "/panel", "/inbox"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});
