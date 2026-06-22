"use client";

import { useTransition, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon, ToggleLeftIcon, ToggleRightIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addPaymentMethodAction,
  togglePaymentMethodAction,
  deletePaymentMethodAction,
  removePaymentQrAction,
} from "./actions";
import type { paymentMethods as paymentMethodsSchema } from "@/lib/db/schema";

type PaymentMethod = typeof paymentMethodsSchema.$inferSelect;

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  bre_b: "Bre-B",
  transferencia: "Transferencia bancaria",
  link: "Link de pago",
};

export function AgentPayments({ items }: { items: PaymentMethod[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [form, setForm] = useState<{ type: string; label: string; details: string }>({
    type: "nequi",
    label: "",
    details: "",
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error("La etiqueta es requerida");
      return;
    }
    if (!form.details.trim()) {
      toast.error("Los detalles son requeridos");
      return;
    }
    startTransition(async () => {
      const result = await addPaymentMethodAction({
        type: form.type,
        label: form.label,
        details: form.details,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Medio de pago agregado");
        setForm({ type: "nequi", label: "", details: "" });
        router.refresh();
      }
    });
  };

  const handleToggle = (id: string, currentEnabled: boolean) => {
    startTransition(async () => {
      const result = await togglePaymentMethodAction(id, !currentEnabled);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deletePaymentMethodAction(id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Medio de pago eliminado");
        setDeleteId(null);
        router.refresh();
      }
    });
  };

  const handleQrUpload = (id: string, file: File) => {
    setUploadingId(id);
    const formData = new FormData();
    formData.append("file", file);
    fetch(`/api/agent/payment-methods/${id}/qr`, {
      method: "POST",
      body: formData,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error al subir QR");
        return res.json();
      })
      .then(() => {
        toast.success("QR cargado");
        setUploadingId(null);
        router.refresh();
      })
      .catch((err) => {
        toast.error(err.message || "Error al subir QR");
        setUploadingId(null);
      });
  };

  const handleRemoveQr = (id: string) => {
    startTransition(async () => {
      const result = await removePaymentQrAction(id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("QR removido");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Medios de pago</CardTitle>
        <CardDescription className="text-xs">
          Configura los medios de pago que el agente puede ofrecer a los clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add form */}
        <form onSubmit={handleAdd} className="space-y-4 p-4 bg-muted/30 rounded-lg border border-muted">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-type">Tipo de medio de pago</Label>
              <Select
                value={form.type}
                onValueChange={(value) => {
                  if (value !== null) {
                    setForm({ ...form, type: value });
                  }
                }}
                disabled={isPending}
              >
                <SelectTrigger id="payment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nequi">{PAYMENT_TYPE_LABELS.nequi}</SelectItem>
                  <SelectItem value="daviplata">{PAYMENT_TYPE_LABELS.daviplata}</SelectItem>
                  <SelectItem value="bre_b">{PAYMENT_TYPE_LABELS.bre_b}</SelectItem>
                  <SelectItem value="transferencia">{PAYMENT_TYPE_LABELS.transferencia}</SelectItem>
                  <SelectItem value="link">{PAYMENT_TYPE_LABELS.link}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-label">Etiqueta (ej: &quot;Nequi personal&quot;)</Label>
              <Input
                id="payment-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Nequi personal"
                disabled={isPending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-details">Detalles (número, cuenta, instrucciones o URL)</Label>
            <Input
              id="payment-details"
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              placeholder="300 123 4567 o instrucciones o https://ejemplo.com/pago"
              disabled={isPending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Agregando..." : "Agregar medio de pago"}
            </Button>
          </div>
        </form>

        {/* Info note */}
        <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 p-3">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            El agente le mostrará al cliente los medios activos y registrará el pago con el comprobante (foto) que envíe.
          </p>
        </div>

        {/* Payment methods list */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay medios de pago aún. Agrega el primero arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">{method.label}</h4>
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {PAYMENT_TYPE_LABELS[method.type]}
                    </span>
                  </div>
                  {method.details && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{method.details}</p>
                  )}
                  {/* QR control */}
                  <div className="flex items-center gap-2 mt-2">
                    {method.qrMediaAssetId ? (
                      <div className="flex items-center gap-2">
                        <Image
                          src={`/api/inbox/media/${method.qrMediaAssetId}`}
                          alt="QR"
                          width={40}
                          height={40}
                          className="rounded object-cover border border-border"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveQr(method.id)}
                          disabled={isPending}
                          className="h-6 px-2 text-xs"
                        >
                          Quitar QR
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRefs.current[method.id]?.click()}
                          disabled={uploadingId !== null}
                          className="h-6 px-2 text-xs"
                        >
                          {uploadingId === method.id ? "Subiendo..." : "Subir QR"}
                        </Button>
                        <input
                          ref={(el) => {
                            if (el) fileInputRefs.current[method.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            if (file) handleQrUpload(method.id, file);
                            e.currentTarget.value = "";
                          }}
                          disabled={uploadingId !== null}
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggle(method.id, method.enabled)}
                    disabled={isPending}
                    className="h-8 w-8 p-0"
                    title={method.enabled ? "Desactivar" : "Activar"}
                  >
                    {method.enabled ? (
                      <ToggleRightIcon className="size-4 text-emerald-600" />
                    ) : (
                      <ToggleLeftIcon className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (deleteId === method.id) {
                        handleDelete(method.id);
                      } else {
                        setDeleteId(method.id);
                      }
                    }}
                    disabled={isPending}
                    className="h-8 w-8 p-0"
                  >
                    {deleteId === method.id ? (
                      <span className="text-xs">¿Seguro?</span>
                    ) : (
                      <Trash2Icon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
