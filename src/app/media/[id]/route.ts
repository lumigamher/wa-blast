import { readFile } from "node:fs/promises";
import { db } from "@/lib/db/client";
import { getMediaAsset } from "@/lib/media/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getMediaAsset(db, id);
  if (!asset) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(asset.path);
    return new Response(buf, {
      headers: {
        "content-type": asset.mime,
        "content-length": String(asset.bytes),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Gone", { status: 410 });
  }
}
