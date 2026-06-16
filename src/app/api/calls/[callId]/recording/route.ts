import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getCallById, setRecordingMediaId } from "@/lib/calls/store";
import { saveMediaAsset } from "@/lib/media/store";

export async function POST(req: Request, { params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return new Response("not found", { status: 404 });
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return new Response("empty", { status: 400 });
  const asset = await saveMediaAsset(db, { orgId, bytes, mime: "audio/webm", kind: "audio" });
  await setRecordingMediaId(db, orgId, callId, asset.id);
  return Response.json({ ok: true, mediaId: asset.id });
}
