"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactAvatar } from "@/app/(app)/inbox/_components/contact-avatar";
import { updateContactAction } from "./actions";

type Row = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
};

export function ContactoPeek({ row }: { row: Row }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: row.name ?? "",
    email: row.email ?? "",
    company: row.company ?? "",
  });

  async function save() {
    setSaving(true);
    const res = await updateContactAction(row.id, form);
    setSaving(false);
    if (res.ok) {
      toast.success("Guardado");
      router.refresh();
    } else {
      toast.error(res.error ?? "Error");
    }
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="sm" />}>Ver</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ContactAvatar seed={row.phone} name={form.name || null} size={36} />
            <span className="truncate">{form.name || row.phone}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="font-mono text-xs text-muted-foreground">{row.phone}</div>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Link
              href={`/contactos/${row.id}`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ficha completa
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
