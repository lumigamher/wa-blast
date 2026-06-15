import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { toOggOpus, toWebpSticker } from "@/lib/media/transcode";

describe("transcode", () => {
  it("convierte webm/opus a ogg/opus", async () => {
    const input = readFileSync("tests/fixtures/voice-sample.webm");
    const out = await toOggOpus(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    expect(Buffer.from(out.subarray(0, 4)).toString("latin1")).toBe("OggS");
    expect(out.byteLength).toBeGreaterThan(0);
  }, 20000);

  it("convierte png a webp 512x512", async () => {
    const input = readFileSync("tests/fixtures/sticker-sample.png");
    const out = await toWebpSticker(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    expect(Buffer.from(out.subarray(0, 4)).toString("latin1")).toBe("RIFF");
    expect(Buffer.from(out.subarray(8, 12)).toString("latin1")).toBe("WEBP");
  }, 20000);
});
