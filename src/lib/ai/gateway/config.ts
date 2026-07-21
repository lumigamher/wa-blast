import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";
import type { DB } from "@/lib/db/client";
import { aiGateway } from "@/lib/db/schema";

export type GatewayProvider = "openai" | "anthropic" | "google" | "custom";

export type GatewayConfig = {
  chatProvider: GatewayProvider;
  chatModel: string;
  openaiKey: string | null;
  anthropicKey: string | null;
  googleKey: string | null;
  customKey: string | null;
  customBaseUrl: string | null;
};

export type GatewayPatch = {
  chatProvider?: GatewayProvider;
  chatModel?: string;
  openaiKey?: string;
  anthropicKey?: string;
  googleKey?: string;
  customKey?: string;
  customBaseUrl?: string;
};

export async function getGatewayConfig(db: DB, orgId: string): Promise<GatewayConfig | null> {
  const row = (await db.select().from(aiGateway).where(eq(aiGateway.orgId, orgId)))[0];
  if (!row) return null;
  const dec = (v: string | null): string | null => {
    if (!v) return null;
    try {
      return decrypt(v);
    } catch {
      return null;
    }
  };
  return {
    chatProvider: row.chatProvider,
    chatModel: row.chatModel,
    openaiKey: dec(row.openaiKeyEnc),
    anthropicKey: dec(row.anthropicKeyEnc),
    googleKey: dec(row.googleKeyEnc),
    customKey: dec(row.customKeyEnc),
    customBaseUrl: row.customBaseUrl,
  };
}

export async function saveGatewayConfig(db: DB, orgId: string, patch: GatewayPatch): Promise<void> {
  const now = new Date();
  const existing = (await db.select().from(aiGateway).where(eq(aiGateway.orgId, orgId)))[0];
  const encOrKeep = (incoming: string | undefined, current: string | null | undefined): string | null => {
    if (incoming && incoming.trim()) return encrypt(incoming.trim());
    return current ?? null;
  };
  const chatProvider = patch.chatProvider ?? existing?.chatProvider ?? "openai";
  const chatModel = patch.chatModel ?? existing?.chatModel ?? "gpt-5-mini";
  const openaiKeyEnc = encOrKeep(patch.openaiKey, existing?.openaiKeyEnc);
  const anthropicKeyEnc = encOrKeep(patch.anthropicKey, existing?.anthropicKeyEnc);
  const googleKeyEnc = encOrKeep(patch.googleKey, existing?.googleKeyEnc);
  const customKeyEnc = encOrKeep(patch.customKey, existing?.customKeyEnc);
  const customBaseUrl =
    patch.customBaseUrl !== undefined
      ? patch.customBaseUrl.trim() || null
      : (existing?.customBaseUrl ?? null);
  const updatedAt = now;
  await db
    .insert(aiGateway)
    .values({ orgId, chatProvider, chatModel, openaiKeyEnc, anthropicKeyEnc, googleKeyEnc, customKeyEnc, customBaseUrl, updatedAt })
    .onConflictDoUpdate({
      target: aiGateway.orgId,
      set: { chatProvider, chatModel, openaiKeyEnc, anthropicKeyEnc, googleKeyEnc, customKeyEnc, customBaseUrl, updatedAt },
    });
}
