"use client";

import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OnboardingStatus } from "@/lib/onboarding/status";

export function Step4Complete({ status }: { status: OnboardingStatus }) {
  const checks = [
    { label: "Credenciales guardadas", done: status.steps.creds },
    { label: "Conexión verificada", done: status.steps.credsVerified },
    { label: "Webhook configurado", done: status.steps.webhookVerified },
    { label: "Mensaje de prueba enviado", done: status.steps.testMessage },
    { label: "Primera campaña creada", done: status.steps.firstCampaign },
  ];

  const allComplete = checks.every((c) => c.done);

  return (
    <Card className="border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
      <CardHeader>
        <CardTitle className="text-base">Paso 4: Listo para empezar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Resumen de activación:</p>
          {checks.map((check, i) => (
            <div key={i} className="flex items-center gap-3">
              <CheckCircle2Icon
                className={cn(
                  "size-5 shrink-0",
                  check.done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              />
              <span className={cn("text-sm", check.done ? "text-emerald-900 dark:text-emerald-100" : "text-muted-foreground")}>
                {check.label}
              </span>
            </div>
          ))}
        </div>

        {allComplete ? (
          <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/20 p-4 text-sm font-medium text-emerald-900 dark:text-emerald-100 text-center">
            ¡Felicidades! Tu WhatsApp está completamente configurado.
          </div>
        ) : (
          <div className="rounded-lg bg-amber-100 dark:bg-amber-900/20 p-4 text-sm font-medium text-amber-900 dark:text-amber-100 text-center">
            Completa los últimos pasos para empezar a enviar campañas.
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/campanas/nueva"
            className={cn(buttonVariants({ variant: "default" }), "flex-1 text-center")}
          >
            Crear primera campaña
          </Link>
          <Link
            href="/contactos"
            className={cn(buttonVariants({ variant: "outline" }), "flex-1 text-center")}
          >
            Importar contactos
          </Link>
        </div>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-4 text-xs">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">Siguiente:</p>
          <ul className="space-y-1 text-blue-800 dark:text-blue-200 list-disc list-inside">
            <li>Crea tu primera campaña y elige plantillas o escribe mensajes personalizados</li>
            <li>Importa contactos desde un CSV o conecta tu CRM</li>
            <li>Programa envíos automáticos con flujos o campañas recurrentes</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
