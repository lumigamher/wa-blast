import { describe, expect, it } from "vitest";
import { isWhatsAppImageMime } from "./transcode";

describe("transcode", () => {
  describe("isWhatsAppImageMime", () => {
    it("retorna true para image/jpeg", () => {
      expect(isWhatsAppImageMime("image/jpeg")).toBe(true);
    });

    it("retorna true para image/jpg", () => {
      expect(isWhatsAppImageMime("image/jpg")).toBe(true);
    });

    it("retorna true para image/png", () => {
      expect(isWhatsAppImageMime("image/png")).toBe(true);
    });

    it("retorna true con mayúsculas (IMAGE/JPEG)", () => {
      expect(isWhatsAppImageMime("IMAGE/JPEG")).toBe(true);
    });

    it("retorna false para image/webp", () => {
      expect(isWhatsAppImageMime("image/webp")).toBe(false);
    });

    it("retorna false para image/gif", () => {
      expect(isWhatsAppImageMime("image/gif")).toBe(false);
    });

    it("retorna false para application/pdf", () => {
      expect(isWhatsAppImageMime("application/pdf")).toBe(false);
    });

    it("retorna false para svg+xml", () => {
      expect(isWhatsAppImageMime("image/svg+xml")).toBe(false);
    });
  });
});
