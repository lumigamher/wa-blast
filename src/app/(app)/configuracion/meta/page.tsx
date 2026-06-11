import Link from "next/link";
import { ArrowLeftIcon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings, ensureVerifyToken } from "@/lib/org/settings";
import { env } from "@/lib/env";
import { saveForwardUrlAction, saveMetaCredsAction, saveOptoutKeywordsAction } from "../actions";
import { CopyField } from "./_components/copy-field";
import { TestConnection } from "./_components/test-connection";

export const dynamic = "force-dynamic";

export default async function MetaSettingsPage() {
  const { orgId } = await requireOrg();
  const s = await getOrgSettings(db, orgId);
  const verifyToken = await ensureVerifyToken(db, orgId);
  const configured = Boolean(s.metaPhoneId && s.metaAccessToken && s.metaWabaId);
  const webhookUrl = `${env.PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL}/api/webhook/meta`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Meta WhatsApp</h1>
          {configured ? (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
              <CheckCircle2Icon className="mr-1 size-3" /> Configurado
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              <AlertCircleIcon className="mr-1 size-3" /> Sin configurar
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Estas credenciales se almacenan encriptadas (AES-256-GCM) y solo se descifran al llamar a la API de Meta.
        </p>
      </header>

      <Card className="border-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10">
        <CardHeader>
          <CardTitle className="text-base">Conecta tu WhatsApp</CardTitle>
          <CardDescription className="text-xs">
            Sigue estos pasos para apuntar los webhooks de Meta a tu instancia de Lula.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField label="Webhook URL" value={webhookUrl} />
          <CopyField label="Verify token" value={verifyToken} />

          <div className="rounded-lg bg-background p-3">
            <p className="mb-2 text-xs font-medium text-foreground">Pasos a seguir:</p>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-semibold">1.</span>
                <span>
                  En Meta Business Manager → tu App → WhatsApp → Configuration, busca la sección{" "}
                  <code className="rounded bg-muted px-1 text-foreground">Webhooks</code>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">2.</span>
                <span>
                  En <code className="rounded bg-muted px-1 text-foreground">Edit Callback URL</code>, pega la URL de
                  arriba y el Verify token. Dale{" "}
                  <code className="rounded bg-muted px-1 text-foreground">Verify and Save</code>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">3.</span>
                <span>
                  Suscríbete al evento <code className="rounded bg-muted px-1 text-foreground">messages</code>.
                </span>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus credenciales de Meta</CardTitle>
          <CardDescription className="text-xs">
            Encuéntralas en Meta Business Manager → WhatsApp → API Setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveMetaCredsAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Phone Number ID" name="metaPhoneId" defaultValue={s.metaPhoneId ?? ""} />
              <Field label="WABA ID" name="metaWabaId" defaultValue={s.metaWabaId ?? ""} />
              <Field
                label="App ID"
                name="metaAppId"
                defaultValue={s.metaAppId ?? ""}
                hint="Meta App ID para carga de medios"
              />
              <Field
                label="Access Token"
                name="metaAccessToken"
                type="password"
                defaultValue={s.metaAccessToken ?? ""}
                hint="System User Token recomendado (sin expiración)"
              />
              <Field
                label="App Secret"
                name="metaAppSecret"
                type="password"
                defaultValue={s.metaAppSecret ?? ""}
                hint="Para verificar firmas de webhooks"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Guardar credenciales</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Probar conexión</CardTitle>
          <CardDescription className="text-xs">
            Verifica que tus credenciales sean correctas y que tu número esté activo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestConnection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forward URL (opcional)</CardTitle>
          <CardDescription className="text-xs">
            Si tienes otra app (Chatwoot, Wati, tu CRM), Lula le reenviará los webhooks de Meta byte-a-byte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveForwardUrlAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="forwardUrl">URL externa</Label>
              <Input
                id="forwardUrl"
                name="forwardUrl"
                type="url"
                defaultValue={s.forwardUrl ?? ""}
                placeholder="https://your-crm.example.com/meta-webhook"
              />
            </div>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opt-out keywords</CardTitle>
          <CardDescription className="text-xs">
            Cuando un contacto responda con cualquiera de estas palabras, se marcará como opted-out automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveOptoutKeywordsAction} className="space-y-3">
            <textarea
              name="keywords"
              rows={3}
              defaultValue={s.optoutKeywords.join(", ")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              placeholder="STOP, BAJA, UNSUBSCRIBE, CANCELAR"
            />
            <div className="flex justify-end">
              <Button type="submit">Guardar palabras</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
