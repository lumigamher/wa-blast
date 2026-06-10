"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const target = email.trim().toLowerCase();
    if (!target.includes("@")) return toast.error("Escribe un correo válido");
    startTransition(async () => {
      const { error } = await authClient.organization.inviteMember({ email: target, role });
      if (error) {
        toast.error(error.message ?? "No pude enviar la invitación");
        return;
      }
      toast.success(`Invitación enviada a ${target}`);
      setEmail("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border bg-background p-4">
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="invite-email" className="text-xs">
          Correo
        </Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="colega@tuempresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-role" className="text-xs">
          Rol
        </Label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="member">Miembro</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <Button onClick={submit} disabled={pending} size="sm" className="h-9">
        <MailPlusIcon className="size-4" />
        {pending ? "Enviando…" : "Invitar"}
      </Button>
    </div>
  );
}

export function InvitationRow({
  id,
  email,
  role,
  expiresAt,
  canManage,
}: {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function cancel() {
    startTransition(async () => {
      const { error } = await authClient.organization.cancelInvitation({ invitationId: id });
      if (error) {
        toast.error(error.message ?? "No pude cancelar la invitación");
        return;
      }
      toast.success("Invitación cancelada");
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{email}</div>
        <div className="text-xs text-muted-foreground">
          Expira {new Date(expiresAt).toLocaleDateString("es-CO", { dateStyle: "medium" })}
        </div>
      </div>
      <Badge variant="outline">{role}</Badge>
      {canManage && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={cancel} aria-label={`Cancelar invitación a ${email}`}>
          <XIcon className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </li>
  );
}
