import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyMetaSignature } from "@/lib/meta/webhook";

const secret = "app-secret-xyz";
const body = '{"object":"whatsapp_business_account","entry":[]}';

function sig(b: string) {
  return "sha256=" + createHmac("sha256", secret).update(b).digest("hex");
}

describe("verifyMetaSignature", () => {
  test("accepts valid sig", () => {
    expect(verifyMetaSignature(body, sig(body), secret)).toBe(true);
  });
  test("rejects invalid sig", () => {
    expect(verifyMetaSignature(body, sig("tampered"), secret)).toBe(false);
  });
  test("rejects malformed header", () => {
    expect(verifyMetaSignature(body, "garbage", secret)).toBe(false);
  });
});
