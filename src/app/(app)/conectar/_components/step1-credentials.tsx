"use client";

import { useState } from "react";
import { Loader2Icon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { verifyMetaConnectionAction } from "../actions";
import { saveMetaCredsAction } from "@/app/(app)/configuracion/actions";
import { ToastForm } from "@/components/toast-form";

export function Step1Credentials({
  savedCreds,
  onVerified,
}: {
  savedCreds: {
    phoneId: string;
    wabaId: string;
    appId: string;
    hasToken: boolean;
    hasSecret: boolean;
  };
  onVerified: () => void;
}) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean;
    phone?: string;
    name?: string;
    quality?: string;
    message?: string;
  } | null>(null);
  const [collapsedFields, setCollapsedFields] = useState({
    phoneId: false,
    wabaId: false,
    appId: false,
    token: false,
    secret: false,
  });

  const handleVerifyConnection = async () => {
    setIsVerifying(true);
    setConnectionResult(null);

    try {
      const result = await verifyMetaConnectionAction();
      setConnectionResult(result);

      if (result.ok) {
        toast.success("Conexión verificada correctamente");
        onVerified();
      } else {
        toast.error(result.message || "Error al verificar");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setConnectionResult({ ok: false, message });
      toast.error(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const toggleField = (field: keyof typeof collapsedFields) => {
    setCollapsedFields((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paso 1: Credenciales de Meta</CardTitle>
        <CardDescription className="text-xs">
          Completa estos campos con las credenciales de tu aplicación de Meta. Encuéntralas en Meta Business Manager
          → WhatsApp → API Setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ToastForm action={saveMetaCredsAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CredentialField
              label="Phone Number ID"
              name="metaPhoneId"
              placeholder="1234567890"
              defaultValue={savedCreds.phoneId}
              hint="Lo encuentras en WhatsApp API → Phone Numbers"
              isCollapsed={collapsedFields.phoneId}
              onToggle={() => toggleField("phoneId")}
              saved={Boolean(savedCreds.phoneId)}
            />
            <CredentialField
              label="WABA ID"
              name="metaWabaId"
              placeholder="5678901234"
              defaultValue={savedCreds.wabaId}
              hint="WhatsApp Business Account ID en la sección Business Accounts"
              isCollapsed={collapsedFields.wabaId}
              onToggle={() => toggleField("wabaId")}
              saved={Boolean(savedCreds.wabaId)}
            />
            <CredentialField
              label="App ID"
              name="metaAppId"
              placeholder="1122334455"
              defaultValue={savedCreds.appId}
              hint="Meta App ID para carga de medios (en App Dashboard)"
              isCollapsed={collapsedFields.appId}
              onToggle={() => toggleField("appId")}
              saved={Boolean(savedCreds.appId)}
            />
            <CredentialField
              label="Access Token"
              name="metaAccessToken"
              type="password"
              placeholder="EAABsBCS..."
              hint="System User Token (token permanente sin expiración)"
              isCollapsed={collapsedFields.token}
              onToggle={() => toggleField("token")}
              saved={savedCreds.hasToken}
            />
          </div>

          <CredentialField
            label="App Secret"
            name="metaAppSecret"
            type="password"
            placeholder="a1b2c3d4..."
            hint="App Secret para verificar firmas de webhooks (en App Dashboard → Configuración)"
            isCollapsed={collapsedFields.secret}
            onToggle={() => toggleField("secret")}
            fullWidth
            saved={savedCreds.hasSecret}
          />

          {(savedCreds.hasToken || savedCreds.hasSecret) && (
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-900/10 dark:text-blue-100">
              <p className="font-medium mb-1">Nota sobre cambios:</p>
              <p>
                Si quieres cambiar el Access Token o App Secret, debes reingresar ambos en los campos arriba.
                Los campos con &quot;•••••••• guardado&quot; no se mostrarán, pero son obligatorios al guardar cambios.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit">Guardar credenciales</Button>
          </div>
        </ToastForm>

        <div className="border-t pt-6">
          <h3 className="mb-3 text-sm font-medium">Probar conexión</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Verifica que tus credenciales sean correctas y que tu número de WhatsApp esté activo.
          </p>

          <Button onClick={handleVerifyConnection} disabled={isVerifying} className="w-full sm:w-auto">
            {isVerifying && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {isVerifying ? "Verificando..." : "Probar conexión"}
          </Button>

          {connectionResult && (
            <div
              className={`mt-4 rounded-lg border p-4 ${
                connectionResult.ok
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10"
                  : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
              }`}
            >
              <div className="flex items-start gap-3">
                {connectionResult.ok ? (
                  <CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircleIcon className="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  {connectionResult.ok ? (
                    <div className="space-y-1 text-sm text-emerald-900 dark:text-emerald-100">
                      <p className="font-medium">Conexión exitosa</p>
                      <p>Número: {connectionResult.phone}</p>
                      <p>Nombre verificado: {connectionResult.name}</p>
                      {connectionResult.quality && <p>Calidad: {connectionResult.quality}</p>}
                    </div>
                  ) : (
                    <div className="text-sm text-red-900 dark:text-red-100">
                      <p className="font-medium">Error</p>
                      <p>{connectionResult.message}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CredentialField({
  label,
  name,
  type = "text",
  placeholder,
  hint,
  defaultValue = "",
  isCollapsed,
  onToggle,
  fullWidth = false,
  saved = false,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder: string;
  hint: string;
  defaultValue?: string;
  isCollapsed: boolean;
  onToggle: () => void;
  fullWidth?: boolean;
  saved?: boolean;
}) {
  // Mostrar badge para tokens/secrets guardados; prefill para IDs
  const isSecretField = name.includes("Token") || name.includes("Secret");
  const displayDefaultValue = isSecretField ? "" : defaultValue; // No prefill tokens/secrets

  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
          >
            <span>{label}</span>
            <span className="text-xs text-muted-foreground">{isCollapsed ? "▸" : "▾"}</span>
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {isSecretField ? "•••••••• guardado" : "✓ guardado"}
            </span>
          )}
        </div>
        {!isCollapsed && (
          <>
            <Input
              id={name}
              name={name}
              type={type}
              placeholder={placeholder}
              defaultValue={displayDefaultValue}
            />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </>
        )}
      </div>
    </div>
  );
}
