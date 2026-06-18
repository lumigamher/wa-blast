"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon, XCircleIcon, CalendarClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  cancelCampaignAction, deleteCampaignAction, rescheduleCampaignAction,
} from "./[id]/actions";

function toLocalInput(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignActions({
  id, status, scheduledAt,
}: { id: string; status: string; scheduledAt: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openResched, setOpenResched] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [when, setWhen] = useState(toLocalInput(scheduledAt));

  const isDraft = status === "draft";
  const canDelete = ["draft", "cancelled", "done", "failed"].includes(status);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, close: () => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(okMsg);
        close();
        router.refresh();
      } else {
        toast.error(r.error ?? "Error");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      {isDraft && (
        <Button variant="ghost" size="sm" title="Editar"
          onClick={() => router.push(`/campanas/nueva?from=${id}`)}>
          <PencilIcon className="size-4" />
        </Button>
      )}

      {isDraft && (
        <Dialog open={openResched} onOpenChange={setOpenResched}>
          <DialogTrigger render={<Button variant="ghost" size="sm" title="Reprogramar" />}>
            <CalendarClockIcon className="size-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Reprogramar campaña</DialogTitle></DialogHeader>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenResched(false)}>Cancelar</Button>
              <Button disabled={pending || !when}
                onClick={() => run(
                  () => rescheduleCampaignAction(id, new Date(when).toISOString()),
                  "Campaña reprogramada", () => setOpenResched(false),
                )}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isDraft && (
        <Dialog open={openCancel} onOpenChange={setOpenCancel}>
          <DialogTrigger render={<Button variant="ghost" size="sm" title="Cancelar envío" />}>
            <XCircleIcon className="size-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>¿Cancelar esta campaña?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">No se enviará. Quedará registrada como cancelada.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCancel(false)}>Volver</Button>
              <Button disabled={pending}
                onClick={() => run(() => cancelCampaignAction(id), "Campaña cancelada", () => setOpenCancel(false))}>
                Cancelar campaña
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canDelete && (
        <Dialog open={openDelete} onOpenChange={setOpenDelete}>
          <DialogTrigger render={<Button variant="ghost" size="sm" title="Eliminar" />}>
            <Trash2Icon className="size-4 text-destructive" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>¿Eliminar esta campaña?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Se borra de forma permanente, junto con sus destinatarios.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDelete(false)}>Volver</Button>
              <Button variant="destructive" disabled={pending}
                onClick={() => run(() => deleteCampaignAction(id), "Campaña eliminada", () => setOpenDelete(false))}>
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
