import { describe, expect, it } from "vitest";
import { validateForwardUrl } from "@/lib/security/validate-forward-url";

describe("validateForwardUrl", () => {
  it("rechaza esquemas no http(s), localhost, IPs privadas y metadata", async () => {
    for (const bad of [
      "file:///etc/passwd", "ftp://x.com/a", "no-es-url",
      "http://localhost:3000/hook", "http://127.0.0.1/hook", "https://[::1]/hook",
      "http://10.0.0.5/hook", "http://172.16.0.1/hook", "http://192.168.1.1/hook",
      "http://169.254.169.254/latest/meta-data", "http://foo.local/hook",
      "https://[::ffff:172.16.0.1]/hook", "http://[::ffff:169.254.169.254]/latest", "http://[::ffff:100.64.0.1]/x",
    ]) {
      const r = await validateForwardUrl(bad);
      expect(r.ok, bad).toBe(false);
    }
  });
  it("acepta https públicas", async () => {
    expect((await validateForwardUrl("https://hooks.zapier.com/x")).ok).toBe(true);
  });
});
