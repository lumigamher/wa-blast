import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/org/settings";
import {
  saveMetaCredsAction,
  saveForwardUrlAction,
  saveOptoutKeywordsAction,
} from "../actions";

export default async function MetaSettingsPage() {
  const { orgId } = await requireOrg();
  const s = await getOrgSettings(db, orgId);

  return (
    <div className="max-w-2xl space-y-10 p-6">
      <section>
        <h2 className="text-lg font-semibold mb-3">Meta WhatsApp credentials</h2>
        <form action={saveMetaCredsAction} className="space-y-3">
          <Field label="Phone Number ID" name="metaPhoneId" defaultValue={s.metaPhoneId ?? ""} />
          <Field label="WABA ID" name="metaWabaId" defaultValue={s.metaWabaId ?? ""} />
          <Field label="Access Token" name="metaAccessToken" type="password" defaultValue={s.metaAccessToken ?? ""} />
          <Field label="App Secret" name="metaAppSecret" type="password" defaultValue={s.metaAppSecret ?? ""} />
          <Field label="Webhook Verify Token" name="metaVerifyToken" defaultValue={s.metaVerifyToken ?? ""} />
          <button className="rounded bg-primary text-primary-foreground px-4 py-2">Save</button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Forward URL (optional)</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Webhooks from Meta will be relayed byte-for-byte to this URL. Leave empty to skip forwarding.
        </p>
        <form action={saveForwardUrlAction} className="flex gap-2">
          <input
            name="forwardUrl"
            type="url"
            defaultValue={s.forwardUrl ?? ""}
            placeholder="https://your-crm.example.com/meta-webhook"
            className="flex-1 rounded border px-3 py-2"
          />
          <button className="rounded bg-primary text-primary-foreground px-4 py-2">Save</button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Opt-out keywords</h2>
        <form action={saveOptoutKeywordsAction} className="space-y-2">
          <textarea
            name="keywords"
            rows={3}
            defaultValue={s.optoutKeywords.join(", ")}
            className="w-full rounded border px-3 py-2"
          />
          <button className="rounded bg-primary text-primary-foreground px-4 py-2">Save</button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded border px-3 py-2"
      />
    </label>
  );
}
