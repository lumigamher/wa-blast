import { describe, expect, it } from "vitest";
import { mediaServeHeaders } from "./serve-headers";

const CSP = "sandbox; default-src 'none'";

describe("mediaServeHeaders", () => {
  it.each(["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/javascript", "", "raro"])(
    "mime peligroso %j -> octet-stream + attachment",
    (mime) => {
      const h = mediaServeHeaders(mime, 10);
      expect(h["content-type"]).toBe("application/octet-stream");
      expect(h["content-disposition"]).toBe("attachment");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["content-security-policy"]).toBe(CSP);
    },
  );

  it.each([
    ["image/jpeg", "image/jpeg"],
    ["image/png", "image/png"],
    ["image/webp", "image/webp"],
    ["image/gif", "image/gif"],
    ["audio/ogg", "audio/ogg"],
    ["video/mp4", "video/mp4"],
  ])("mime seguro %s -> inline", (mime, expected) => {
    const h = mediaServeHeaders(mime, 10);
    expect(h["content-type"]).toBe(expected);
    expect(h["content-disposition"]).toBeUndefined();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toBe(CSP);
  });

  it("PDF inline con su tipo, sin sandbox (Chrome lo deja en blanco), con nosniff", () => {
    const h = mediaServeHeaders("application/pdf", 10);
    expect(h["content-type"]).toBe("application/pdf");
    expect(h["content-disposition"]).toBeUndefined();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toBeUndefined();
  });

  it("normaliza mayúsculas y parámetros", () => {
    expect(mediaServeHeaders("image/PNG; charset=x", 1)["content-type"]).toBe("image/png");
    expect(mediaServeHeaders(" Audio/OGG; codecs=opus", 1)["content-type"]).toBe("audio/ogg");
    expect(mediaServeHeaders("TEXT/HTML; charset=utf-8", 1)["content-type"]).toBe("application/octet-stream");
  });

  it("content-length opcional y cache-control opcional", () => {
    expect(mediaServeHeaders("image/png", 42)["content-length"]).toBe("42");
    expect(mediaServeHeaders("image/png")["content-length"]).toBeUndefined();
    expect(mediaServeHeaders("image/png", 1, "private, max-age=1")["cache-control"]).toBe("private, max-age=1");
    expect(mediaServeHeaders("image/png")["cache-control"]).toBeUndefined();
  });

  it("audio/ o video/ sin subtipo no es seguro", () => {
    expect(mediaServeHeaders("audio/", 1)["content-type"]).toBe("application/octet-stream");
  });
});
