import { spawn } from "node:child_process";
import sharp from "sharp";

function run(args: string[], input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(new Uint8Array(Buffer.concat(chunks)));
      else reject(new Error(`ffmpeg salió ${code}: ${Buffer.concat(errChunks).toString().slice(-500)}`));
    });
    proc.stdin.on("error", () => {});
    proc.stdin.write(Buffer.from(input));
    proc.stdin.end();
  });
}

/** Convierte cualquier audio de entrada a OGG/Opus (nota de voz de WhatsApp). */
export async function toOggOpus(input: ArrayBuffer): Promise<Uint8Array> {
  return run(["-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"], new Uint8Array(input));
}

/** Convierte una imagen a WEBP 512x512 con transparencia (sticker de WhatsApp). */
export async function toWebpSticker(input: ArrayBuffer): Promise<Uint8Array> {
  const out = await sharp(Buffer.from(input))
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
  return new Uint8Array(out);
}
