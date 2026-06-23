"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { saveGatewayConfig, type GatewayPatch } from "@/lib/ai/gateway/config";
import { resolveChatProvider, resolveEmbeddingProvider } from "@/lib/ai/gateway/resolve";

export async function saveGatewayAction(patch: GatewayPatch): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    await saveGatewayConfig(db, orgId, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al guardar" };
  }
  revalidatePath("/configuracion/ia");
  return { ok: true };
}

export async function testGatewayAction(
  which: "chat" | "openai-embeddings",
): Promise<{ ok: true; detail: string } | { error: string }> {
  const { orgId } = await requireOrg();
  try {
    if (which === "chat") {
      const r = await resolveChatProvider(db, orgId);
      if (!r.ok) return { error: r.error };
      const res = await r.provider.chat({
        system: "Responde solo 'ok'.",
        messages: [{ role: "user", content: "ok" }],
        tools: [],
        temperature: 0,
        model: r.model,
      });
      return { ok: true, detail: `Modelo ${r.model} respondió (${res.usage.completionTokens} tokens).` };
    }
    const emb = await resolveEmbeddingProvider(db, orgId);
    if (!emb) return { error: "Falta tu API key de OpenAI." };
    const vecs = await emb.embed(["ping"]);
    return { ok: true, detail: `Embeddings OK (dim ${vecs[0]?.length ?? 0}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "La prueba falló (¿key inválida?)." };
  }
}
