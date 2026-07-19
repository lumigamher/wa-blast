import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import type { OnboardingStatus } from "@/lib/onboarding/status";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STEP_LABELS: Record<keyof OnboardingStatus["steps"], string> = {
  creds: "Credenciales",
  credsVerified: "Conexión probada",
  webhookVerified: "Webhook activo",
  testMessage: "Mensaje de prueba",
  firstCampaign: "Primera campaña",
};

const STEP_ORDER: (keyof OnboardingStatus["steps"])[] = [
  "creds",
  "credsVerified",
  "webhookVerified",
  "testMessage",
  "firstCampaign",
];

export function OnboardingBanner({ status }: { status: OnboardingStatus }) {
  if (status.complete) {
    return null;
  }

  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Configura tu integración</CardTitle>
          <CardDescription>
            Completa los pasos para activar tus envíos masivos.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {STEP_ORDER.map((step) => {
            const isComplete = status.steps[step];
            const Icon = isComplete ? CheckCircle2 : Circle;
            const color = isComplete
              ? "text-emerald-600"
              : "text-muted-foreground";

            return (
              <div key={step} className="flex items-center gap-3">
                <Icon className={`size-5 flex-shrink-0 ${color}`} />
                <span
                  className={`text-sm ${
                    isComplete ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>

        <Link
          href="/conectar"
          className={buttonVariants({ size: "sm", variant: "default" })}
        >
          Continuar configuración
        </Link>
      </CardContent>
    </Card>
  );
}
