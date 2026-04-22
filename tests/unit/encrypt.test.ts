import { describe, expect, test } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto/encrypt";

describe("encrypt/decrypt", () => {
  test("roundtrip plaintext", () => {
    const pt = "EAABwzLixnjYBO...very-secret";
    const ct = encrypt(pt);
    expect(ct).not.toBe(pt);
    expect(decrypt(ct)).toBe(pt);
  });

  test("ciphertext differs across calls (nonce)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  test("tampered ciphertext throws", () => {
    const ct = encrypt("x");
    const bad = ct.slice(0, -2) + "AA";
    expect(() => decrypt(bad)).toThrow();
  });
});
