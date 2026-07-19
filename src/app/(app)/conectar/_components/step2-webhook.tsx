"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { OnboardingStatus } from "@/lib/onboarding/status";

export function Step2Webhook({
  webhook,
  status,
  isPolling,
}: {
  webhook: { url: string; token: string };
  status: OnboardingStatus;
  isPolling: boolean;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paso 2: Configurar Webhook</CardTitle>
        <CardDescription className="text-xs">
          Copia estos datos en Meta Business Manager para que Meta pueda comunicarse con Lula cuando lleguen mensajes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Webhook URL</Label>
            <div className="mt-1.5 flex gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs text-foreground break-all">
                {webhook.url}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(webhook.url, "url")}
                className="shrink-0"
              >
                {copiedField === "url" ? (
                  <>
                    <CheckIcon className="size-4" />
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Verify Token</Label>
            <div className="mt-1.5 flex gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs text-foreground break-all">
                {webhook.token}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(webhook.token, "token")}
                className="shrink-0"
              >
                {copiedField === "token" ? (
                  <>
                    <CheckIcon className="size-4" />
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-4">
          <p className="mb-3 text-xs font-semibold text-blue-900 dark:text-blue-100">Pasos en Meta:</p>
          <ol className="space-y-2 text-xs text-blue-800 dark:text-blue-200">
            <li className="flex gap-2">
              <span className="font-semibold flex-shrink-0">1.</span>
              <span>
                Ve a <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">Meta Business Manager</code> → tu
                App → <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">WhatsApp</code> →{" "}
                <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">Configuration</code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold flex-shrink-0">2.</span>
              <span>
                Busca la sección <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">Webhooks</code> y haz
                click en <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">Edit Callback URL</code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold flex-shrink-0">3.</span>
              <span>
                Pega la URL y el Verify Token arriba, luego dale a{" "}
                <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">Verify and Save</code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold flex-shrink-0">4.</span>
              <span>
                Suscríbete a todos los campos, especialmente{" "}
                <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">messages</code> y{" "}
                <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">message_template_status_update</code>
              </span>
            </li>
          </ol>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4">
          {isPolling ? (
            <>
              <Loader2Icon className="size-5 text-amber-600 dark:text-amber-400 animate-spin" />
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <p className="font-medium">Esperando a Meta...</p>
                <p className="text-xs">Revisando cada 5 segundos</p>
              </div>
            </>
          ) : status.steps.webhookVerified ? (
            <>
              <CheckIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm text-emerald-900 dark:text-emerald-100">
                <p className="font-medium">Webhook verificado</p>
              </div>
            </>
          ) : (
            <>
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                Esperando...
              </Badge>
              <div className="text-sm text-muted-foreground">
                <p>Meta confirmará el webhook cuando lo configure en su panel</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
