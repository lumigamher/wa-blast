import Link from "next/link";
import { ArrowLeftIcon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { getCallingSettings } from "@/lib/meta/calling";
import { ToastForm } from "@/components/toast-form";
import { saveCallingSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CallingConfigPage() {
  const { orgId } = await requireOrg();
  const settings = await getOrgSettings(db, orgId);
  const current = await getCallingSettings(settings);

  const hasError = "error" in current;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Llamadas por WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Habilita y configura las llamadas de WhatsApp en tu número.
        </p>
      </header>

      {hasError ? (
        <Card className="border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10">
          <CardContent className="flex gap-3 pt-6">
            <AlertCircleIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Configura primero tus credenciales de Meta
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Ve a{" "}
                <Link href="/configuracion/meta" className="underline hover:no-underline">
                  Configuración → Meta WhatsApp
                </Link>
                {" "}para completar tu configuración.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración de llamadas</CardTitle>
            <CardDescription className="text-xs">
              Ajusta los parámetros de llamadas en tu número de WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToastForm action={saveCallingSettingsAction} className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    id="status"
                    name="status"
                    type="checkbox"
                    defaultChecked={current.status === "ENABLED"}
                    className="size-4 rounded border-gray-300"
                    aria-describedby="status-hint"
                  />
                  <label htmlFor="status" className="text-sm font-medium">
                    Habilitar llamadas de WhatsApp en este número
                  </label>
                </div>
                <p id="status-hint" className="text-xs text-muted-foreground ml-7">
                  Cuando está habilitado, tus contactos podrán iniciar llamadas de voz en WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="call_icon_visibility" className="text-sm font-medium">
                  Visibilidad del ícono de llamada
                </Label>
                <Select
                  name="call_icon_visibility"
                  defaultValue={current.call_icon_visibility ?? "DEFAULT"}
                >
                  <SelectTrigger id="call_icon_visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">Mostrar ícono de llamada</SelectItem>
                    <SelectItem value="DISABLE_ALL">Ocultar ícono de llamada</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controla si se muestra el ícono de llamada a tus contactos.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    id="callback_permission"
                    name="callback_permission"
                    type="checkbox"
                    defaultChecked={current.callback_permission_status === "ENABLED"}
                    className="size-4 rounded border-gray-300"
                    aria-describedby="callback-hint"
                  />
                  <label htmlFor="callback_permission" className="text-sm font-medium">
                    Permitir solicitar permiso de devolución de llamada
                  </label>
                </div>
                <p id="callback-hint" className="text-xs text-muted-foreground ml-7">
                  Permite que Meta solicite permiso a los contactos para devoluciones de llamada.
                </p>
              </div>

              <Card className="border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Nota:</strong> Para recibir eventos de llamada, suscribe el campo{" "}
                    <code className="rounded bg-muted px-1 font-mono text-foreground">calls</code> en el webhook
                    en{" "}
                    <Link href="/configuracion/meta" className="underline hover:no-underline">
                      Configuración → Meta WhatsApp
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit">Guardar</Button>
              </div>
            </ToastForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
