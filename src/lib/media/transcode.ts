import { spawn } from "node:child_process";
import { mkdtemp, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Convierte cualquier audio de entrada a OGG/Opus (nota de voz de WhatsApp).
 * Escribe a un archivo temporal (contenedor "seekable") en vez de a un pipe:
 * así ffmpeg finaliza correctamente las cabeceras/granule del OGG. Algunos
 * clientes (incl. WhatsApp del destinatario) muestran "audio no disponible"
 * con OGG generado vía pipe. opus mono 48k es el único formato de nota de voz
 * que acepta la Cloud API.
 */
export async function toOggOpus(input: ArrayBuffer): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "voz-"));
  const outPath = join(dir, "out.ogg");
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "ffmpeg",
        ["-i", "pipe:0", "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", outPath, "-y"],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      const err: Buffer[] = [];
      proc.stderr.on("data", (c) => err.push(c));
      proc.on("error", reject);
      proc.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg salió ${code}: ${Buffer.concat(err).toString().slice(-400)}`)),
      );
      proc.stdin.on("error", () => {});
      proc.stdin.write(Buffer.from(new Uint8Array(input)));
      proc.stdin.end();
    });
    const out = await readFile(outPath);
    return new Uint8Array(out);
  } finally {
    await unlink(outPath).catch(() => {});
  }
}

/** Convierte una imagen a WEBP 512x512 con transparencia (sticker de WhatsApp). */
export async function toWebpSticker(input: ArrayBuffer): Promise<Uint8Array> {
  const out = await sharp(Buffer.from(input))
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
  return new Uint8Array(out);
}
