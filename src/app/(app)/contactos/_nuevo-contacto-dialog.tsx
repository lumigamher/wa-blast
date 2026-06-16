"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createContactAction } from "./actions";

export function NuevoContactoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ msg: string; existingId?: string } | null>(null);

  async function action(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await createContactAction({
      phone: String(formData.get("phone") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      company: String(formData.get("company") ?? ""),
    });
    setPending(false);
    if (res.ok) {
      toast.success("Contacto creado");
      setOpen(false);
      router.refresh();
    } else {
      setError({ msg: res.error, existingId: res.existingId });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon className="size-4" />
        Nuevo contacto
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono *</Label>
            <Input id="phone" name="phone" required placeholder="+57 300 123 4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Empresa</Label>
            <Input id="company" name="company" />
          </div>
          {error && (
            <p className="text-sm text-destructive">
              {error.msg}
              {error.existingId && (
                <>
                  {" · "}
                  <Link className="underline" href={`/contactos/${error.existingId}`}>
                    ver contacto
                  </Link>
                </>
              )}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
