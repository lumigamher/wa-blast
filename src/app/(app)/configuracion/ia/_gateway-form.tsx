"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, CircleIcon, Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GatewayProvider } from "@/lib/ai/gateway/config";
import type { ListedModel } from "@/lib/ai/gateway/list-models";
import { listModelsAction, saveGatewayAction, testGatewayAction } from "./actions";

const PROVIDERS: { id: GatewayProvider; name: string; keyHint: string }[] = [
  { id: "openai", name: "OpenAI", keyHint: "sk-…" },
  { id: "anthropic", name: "Anthropic", keyHint: "sk-ant-…" },
  { id: "google", name: "Google Gemini", keyHint: "AIza…" },
  { id: "custom", name: "Compatible OpenAI", keyHint: "key de OpenRouter, Groq, etc." },
];

export function GatewayForm(props: {
  chatProvider: GatewayProvider;
  chatModel: string;
  hasKey: Record<GatewayProvider, boolean>;
  customBaseUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<GatewayProvider>(props.chatProvider);
  const [model, setModel] = useState(props.chatModel);
  const [keys, setKeys] = useState<Record<GatewayProvider, string>>({ openai: "", anthropic: "", google: "", custom: "" });
  const [baseUrl, setBaseUrl] = useState(props.customBaseUrl);
  const [models, setModels] = useState<ListedModel[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [query, setQuery] = useState("");

  const keySaved = props.hasKey[provider];
  const keyTyped = keys[provider].trim().length > 0;

  const loadModels = (p: GatewayProvider) => {
    setLoadingModels(true);
    setModelsError(null);
    startTransition(async () => {
      const r = await listModelsAction(p);
      setLoadingModels(false);
      if (!r.ok) {
        setModels(null);
        setModelsError(r.error);
        return;
      }
      setModels(r.models);
    });
  };

  // Al entrar (o cambiar de proveedor) con key ya guardada, carga los modelos solo.
  useEffect(() => {
    setModels(null);
    setModelsError(null);
    setQuery("");
    if (props.hasKey[provider] && (provider !== "custom" || props.customBaseUrl)) {
      loadModels(provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const save = (opts?: { thenLoadModels?: boolean }) => {
    startTransition(async () => {
      const r = await saveGatewayAction({
        chatProvider: provider,
        chatModel: model,
        openaiKey: keys.openai || undefined,
        anthropicKey: keys.anthropic || undefined,
        googleKey: keys.google || undefined,
        customKey: keys.custom || undefined,
        customBaseUrl: provider === "custom" ? baseUrl : undefined,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Configuración de IA guardada");
      setKeys({ openai: "", anthropic: "", google: "", custom: "" });
      router.refresh();
      if (opts?.thenLoadModels) loadModels(provider);
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

  const q = query.trim().toLowerCase();
  const visibleModels = (models ?? []).filter(
    (m) => !q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
  );
  const recommended = visibleModels.filter((m) => m.recommended);
  const others = visibleModels.filter((m) => !m.recommended);

  return (
    <div className="space-y-4">
      {/* Selección de proveedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proveedor</CardTitle>
          <CardDescription className="text-xs">
            Conecta tu cuenta del proveedor de IA. El consumo se cobra directo en tu cuenta con ellos; tus llaves se guardan cifradas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {PROVIDERS.map((p) => {
              const active = provider === p.id;
              const connected = props.hasKey[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                    active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {active ? (
                      <CheckCircle2Icon className="size-4 text-primary" />
                    ) : (
                      <CircleIcon className="size-4 text-muted-foreground/40" />
                    )}
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      connected
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {connected ? "Conectada" : "Sin conectar"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Key del proveedor activo */}
          <div className="space-y-2">
            {provider === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="baseUrl">URL base</Label>
                <Input
                  id="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="apikey">API key</Label>
                {keySaved && (
                  <span className="text-[11px] text-muted-foreground">•••••••• guardada — escribe una nueva para reemplazarla</span>
                )}
              </div>
              <Input
                id="apikey"
                type="password"
                value={keys[provider]}
                onChange={(e) => setKeys((k) => ({ ...k, [provider]: e.target.value }))}
                placeholder={PROVIDERS.find((p) => p.id === provider)?.keyHint}
              />
            </div>
            {(keyTyped || (provider === "custom" && baseUrl !== props.customBaseUrl)) && (
              <Button size="sm" disabled={isPending} onClick={() => save({ thenLoadModels: true })}>
                Guardar y cargar modelos
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modelos disponibles */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Modelo</CardTitle>
            <CardDescription className="text-xs">
              Modelos disponibles en tu cuenta de {PROVIDERS.find((p) => p.id === provider)?.name}.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || loadingModels || (!keySaved && !keyTyped)}
            onClick={() => loadModels(provider)}
            className="gap-1.5"
          >
            {loadingModels ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!keySaved && !models && (
            <p className="py-2 text-sm text-muted-foreground">Conecta tu API key para ver los modelos disponibles.</p>
          )}
          {modelsError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {modelsError} También puedes escribir el id del modelo manualmente abajo.
            </p>
          )}
          {loadingModels && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}
          {models && models.length > 8 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar modelo…" className="pl-8" />
            </div>
          )}
          {models && (
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {recommended.length > 0 && (
                <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recomendados</p>
              )}
              {recommended.map((m) => (
                <ModelRow key={m.id} m={m} selected={model === m.id} onSelect={() => setModel(m.id)} />
              ))}
              {others.length > 0 && (
                <p className="pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Todos los modelos</p>
              )}
              {others.map((m) => (
                <ModelRow key={m.id} m={m} selected={model === m.id} onSelect={() => setModel(m.id)} />
              ))}
              {visibleModels.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">Ningún modelo coincide con la búsqueda.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="modelId" className="text-xs text-muted-foreground">
              Modelo seleccionado (puedes escribir un id manualmente)
            </Label>
            <Input id="modelId" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button disabled={isPending || !model.trim()} onClick={() => save()}>
              Guardar configuración
            </Button>
            <Button variant="outline" disabled={isPending} onClick={() => test("chat")}>
              Probar respuesta
            </Button>
            <Button variant="outline" disabled={isPending} onClick={() => test("openai-embeddings")}>
              Probar base de conocimiento
            </Button>
          </div>
          {provider !== "openai" && (
            <p className="text-[11px] text-muted-foreground">
              La base de conocimiento (documentos) usa OpenAI para buscar: conecta también una key de OpenAI si vas a usarla.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ModelRow({ m, selected, onSelect }: { m: ListedModel; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{m.label}</span>
          {selected && <CheckCircle2Icon className="size-3.5 shrink-0 text-primary" />}
        </div>
        {m.hint && <p className="truncate text-xs text-muted-foreground">{m.hint}</p>}
      </div>
      {m.cost && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{m.cost}</span>
      )}
    </button>
  );
}
