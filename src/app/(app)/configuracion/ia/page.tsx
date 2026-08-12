import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getGatewayConfig } from "@/lib/ai/gateway/config";
import { GatewayForm } from "./_gateway-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { orgId } = await requireOrg();
  const cfg = await getGatewayConfig(db, orgId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">IA / Modelos</h1>
        <p className="text-sm text-muted-foreground">
          Configura el proveedor, el modelo y tus API keys. Alimenta el agente, los Flows con IA y la base de conocimiento.
        </p>
      </div>
      <GatewayForm
        chatProvider={cfg?.chatProvider ?? "openai"}
        chatModel={cfg?.chatModel ?? "gpt-5-mini"}
        hasKey={{
          openai: !!cfg?.openaiKey,
          anthropic: !!cfg?.anthropicKey,
          google: !!cfg?.googleKey,
          openrouter: !!cfg?.openrouterKey,
          custom: !!cfg?.customKey,
        }}
        customBaseUrl={cfg?.customBaseUrl ?? ""}
        fallbackModel={cfg?.fallbackModel ?? ""}
      />
    </div>
  );
}
