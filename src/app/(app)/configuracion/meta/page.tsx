import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import { saveForwardUrlAction, saveMetaCredsAction, saveOptoutKeywordsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MetaSettingsPage() {
  const { orgId } = await requireOrg();
  const s = await getOrgSettings(db, orgId);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/configuracion" className="text-xs text-muted-foreground hover:underline">
          <ArrowLeftIcon className="inline size-3" /> Configuración
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Meta WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Estas credenciales se almacenan encriptadas (AES-256-GCM) y solo se descifran al llamar a la API de Meta.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciales</CardTitle>
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
              <Field
                label="Webhook Verify Token"
                name="metaVerifyToken"
                defaultValue={s.metaVerifyToken ?? ""}
                hint="Cualquier string — lo pegarás en Meta → Webhooks"
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
          <CardTitle className="text-base">Forward URL (opcional)</CardTitle>
          <CardDescription className="text-xs">
            Si tienes otra app (Chatwoot, Wati, tu CRM), wa-blast le reenviará los webhooks de Meta byte-a-byte.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo apuntar Meta a wa-blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            En Meta Business Manager → WhatsApp → Configuration → Webhooks, pon como Callback URL:{" "}
            <code className="rounded bg-muted px-1 text-foreground">https://tu-dominio.com/api/webhook/meta</code>
          </p>
          <p>
            Como Verify Token, usa el que guardaste arriba en el campo{" "}
            <code className="rounded bg-muted px-1 text-foreground">Webhook Verify Token</code>.
          </p>
          <p>Suscríbete a los eventos: <b>messages</b>.</p>
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
