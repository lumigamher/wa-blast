"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactAvatar } from "@/app/(app)/inbox/_components/contact-avatar";
import { CallButton } from "../../_components/call-button";
import {
  updateContactAction,
  deleteContactAction,
  setContactTagsAction,
} from "../actions";

type Tag = { id: string; name: string; color: string };
type Contact = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  birthday: string | null;
  city: string | null;
  tagList: Tag[];
};

export function FichaContacto({ contact, allTags }: { contact: Contact; allTags: Tag[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: contact.name ?? "",
    email: contact.email ?? "",
    company: contact.company ?? "",
    city: contact.city ?? "",
    birthday: contact.birthday ?? "",
    notes: contact.notes ?? "",
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(contact.tagList.map((t) => t.id));

  async function save() {
    setSaving(true);
    const res = await updateContactAction(contact.id, form);
    if (res.ok) await setContactTagsAction(contact.id, selectedTags);
    setSaving(false);
    if (res.ok) {
      toast.success("Guardado");
      router.refresh();
    } else {
      toast.error(res.error ?? "Error al guardar");
    }
  }

  async function remove() {
    if (!confirm("¿Borrar este contacto?")) return;
    const res = await deleteContactAction(contact.id);
    if (!res.ok) {
      toast.error("No se pudo borrar el contacto");
      return;
    }
    toast.success("Contacto borrado");
    router.push("/contactos");
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ContactAvatar seed={contact.phone} name={form.name || null} size={56} />
          <div>
            <div className="text-lg font-semibold">{form.name || contact.phone}</div>
            <div className="font-mono text-xs text-muted-foreground">{contact.phone}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CallButton contactId={contact.id} name={form.name || contact.name} phone={contact.phone} />
          <Button variant="ghost" size="sm" onClick={remove} className="text-destructive">
            <Trash2Icon className="size-4" />
            Borrar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
        <Field label="Ciudad" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field label="Cumpleaños" type="date" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={4}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {allTags.length === 0 && <span className="text-xs text-muted-foreground">No hay tags creadas.</span>}
          {allTags.map((t) => {
            const on = selectedTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? "bg-muted" : "opacity-60 hover:opacity-100"}`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
