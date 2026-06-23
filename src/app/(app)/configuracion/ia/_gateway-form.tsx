"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURATED_MODELS } from "@/lib/agent/providers/models";
import { saveGatewayAction, testGatewayAction } from "./actions";

export function GatewayForm(props: {
  chatProvider: "openai" | "anthropic";
  chatModel: string;
  hasOpenaiKey: boolean;
  hasAnthropicKey: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<"openai" | "anthropic">(props.chatProvider);
  const [model, setModel] = useState(props.chatModel);
  const [custom, setCustom] = useState(!CURATED_MODELS[props.chatProvider].some((m) => m.id === props.chatModel));
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveGatewayAction({ chatProvider: provider, chatModel: model, openaiKey: openaiKey || undefined, anthropicKey: anthropicKey || undefined });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Configuración de IA guardada");
      setOpenaiKey("");
      setAnthropicKey("");
      router.refresh();
    });
  };

  const test = (which: "chat" | "openai-embeddings") => {
    startTransition(async () => {
      const r = await testGatewayAction(which);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.detail);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proveedor y modelo</CardTitle>
        <CardDescription className="text-xs">Tus llaves se guardan cifradas. Déjalas vacías para no cambiarlas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="provider">Proveedor de chat</Label>
            <Select value={provider} onValueChange={(v) => {
              if (v === "openai" || v === "anthropic") {
                setProvider(v);
                const list = CURATED_MODELS[v];
                if (!custom && !list.some((m) => m.id === model)) setModel(list[0].id);
              }
            }}>
              <SelectTrigger id="provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Modelo</Label>
            <Select value={custom ? "__custom__" : model} onValueChange={(v) => {
              if (v === "__custom__") setCustom(true);
              else if (v) { setCustom(false); setModel(v); }
            }}>
              <SelectTrigger id="model"><SelectValue placeholder="Selecciona un modelo..." /></SelectTrigger>
              <SelectContent>
                {CURATED_MODELS[provider].map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label} · {m.cost} — {m.hint}</SelectItem>
                ))}
                <SelectItem value="__custom__">Personalizado…</SelectItem>
              </SelectContent>
            </Select>
            {custom && (
              <Input className="mt-2" value={model} onChange={(e) => setModel(e.target.value)}
                placeholder={provider === "openai" ? "gpt-5-mini" : "claude-haiku-4-5-20251001"} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="openai-key">API key de OpenAI</Label>
            <Input id="openai-key" type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={props.hasOpenaiKey ? "•••• (déjalo vacío para no cambiarla)" : "sk-..."} />
            <p className="text-xs text-muted-foreground">Necesaria para la base de conocimiento (RAG), aunque el chat sea Anthropic.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anthropic-key">API key de Anthropic</Label>
            <Input id="anthropic-key" type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder={props.hasAnthropicKey ? "•••• (déjalo vacío para no cambiarla)" : "sk-ant-..."} />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => test("chat")}>Probar chat</Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => test("openai-embeddings")}>Probar embeddings</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
