import { describe, expect, it } from "vitest";
import { matchesMagicBytes } from "@/lib/media/magic-bytes";

describe("matchesMagicBytes", () => {
  it("acepta firmas correctas", () => {
    expect(matchesMagicBytes("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(matchesMagicBytes("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(matchesMagicBytes("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
  });
  it("rechaza contenido que no coincide con el MIME declarado", () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(matchesMagicBytes("image/jpeg", elf)).toBe(false);
    expect(matchesMagicBytes("image/png", elf)).toBe(false);
  });
  it("deja pasar MIMEs sin firma registrada", () => {
    expect(matchesMagicBytes("audio/ogg", new Uint8Array(16))).toBe(true);
  });
});
