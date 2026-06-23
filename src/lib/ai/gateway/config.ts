import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto/encrypt";
import type { DB } from "@/lib/db/client";
import { aiGateway } from "@/lib/db/schema";

export type GatewayConfig = {
  chatProvider: "openai" | "anthropic";
  chatModel: string;
  openaiKey: string | null;
  anthropicKey: string | null;
};

export type GatewayPatch = {
  chatProvider?: "openai" | "anthropic";
  chatModel?: string;
  openaiKey?: string;
  anthropicKey?: string;
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
  };
}

export async function saveGatewayConfig(db: DB, orgId: string, patch: GatewayPatch): Promise<void> {
  const now = new Date();
  const existing = (await db.select().from(aiGateway).where(eq(aiGateway.orgId, orgId)))[0];
  const encOrKeep = (incoming: string | undefined, current: string | null | undefined): string | null => {
    if (incoming && incoming.trim()) return encrypt(incoming.trim());
    return current ?? null;
  };
  const values = {
    orgId,
    chatProvider: patch.chatProvider ?? existing?.chatProvider ?? "openai",
    chatModel: patch.chatModel ?? existing?.chatModel ?? "gpt-5-mini",
    openaiKeyEnc: encOrKeep(patch.openaiKey, existing?.openaiKeyEnc),
    anthropicKeyEnc: encOrKeep(patch.anthropicKey, existing?.anthropicKeyEnc),
    updatedAt: now,
  };
  const { orgId: _, ...updateValues } = values;
  await db
    .insert(aiGateway)
    .values(values)
    .onConflictDoUpdate({ target: aiGateway.orgId, set: updateValues });
}
