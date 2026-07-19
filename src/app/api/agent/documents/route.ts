import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { checkModuleGate } from "@/lib/billing/access";
import { db } from "@/lib/db/client";
import { saveMediaAsset } from "@/lib/media/store";
import { extractDocumentText } from "@/lib/agent/rag/extract";
import { ingestDocument } from "@/lib/agent/rag/ingest";
import { resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";
import { RAG_LIMITS } from "@/lib/agent/rag/limits";

export async function POST(req: Request): Promise<NextResponse> {
  const { orgId } = await requireOrg();
  if (!(await checkModuleGate(db, orgId, "agente"))) {
    return NextResponse.json({ error: "Tu plan no incluye el agente IA." }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size > RAG_LIMITS.maxBytesPerDoc) {
    return NextResponse.json(
      {
        error: `Archivo muy grande (máx ${Math.round(RAG_LIMITS.maxBytesPerDoc / 1024 / 1024)}MB)`,
      },
      { status: 413 },
    );
  }

  let text: string;
  try {
    text = await extractDocumentText(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No pude leer el archivo" },
      { status: 422 },
    );
  }

  const bytes = await file.arrayBuffer();
  const asset = await saveMediaAsset(db, {
    orgId,
    bytes,
    mime: file.type || "application/octet-stream",
    kind: "document",
  });

  try {
    const embeddings = await resolveEmbeddingProvider(db, orgId);
    if (!embeddings) {
      return NextResponse.json({ error: "Configura tu API key de OpenAI en Configuración › IA." }, { status: 400 });
    }
    const res = await ingestDocument(
      db,
      orgId,
      {
        name: file.name,
        text,
        source: "upload",
        mediaAssetId: asset.id,
        bytes: file.size,
      },
      { embeddings },
    );
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al indexar" },
      { status: 400 },
    );
  }
}
