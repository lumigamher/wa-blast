"use client";

import { useState } from "react";
import { Loader2Icon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { sendTestMessageAction } from "../actions";

export function Step3TestMessage({ onMessageSent }: { onMessageSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error("Ingresa un número de teléfono");
      return;
    }

    setIsSending(true);
    setResult(null);

    const formData = new FormData();
    formData.append("phone", phone);

    try {
      const res = await sendTestMessageAction(formData);
      setResult(res);

      if (res.ok) {
        toast.success(res.message);
        onMessageSent();
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setResult({ ok: false, message });
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paso 3: Enviar Mensaje de Prueba</CardTitle>
        <CardDescription className="text-xs">
          Envía un mensaje a un número de WhatsApp para verificar que todo funciona correctamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Número de teléfono</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+57 300 1234567 o 3001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSending}
            />
            <p className="text-xs text-muted-foreground">
              Usa el formato E.164 con el país (+57 para Colombia) o déjalo sin el +57 al inicio.
            </p>
          </div>

          <Button type="submit" disabled={isSending} className="w-full sm:w-auto">
            {isSending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {isSending ? "Enviando..." : "Enviar mensaje"}
          </Button>
        </form>

        {result && (
          <div
            className={`rounded-lg border p-4 ${
              result.ok
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10"
                : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
            }`}
          >
            <div className="flex items-start gap-3">
              {result.ok ? (
                <CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircleIcon className="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                {result.ok ? (
                  <div className="space-y-1 text-sm text-emerald-900 dark:text-emerald-100">
                    <p className="font-medium">Mensaje enviado</p>
                    <p>{result.message}</p>
                  </div>
                ) : (
                  <div className="text-sm text-red-900 dark:text-red-100">
                    <p className="font-medium">Error</p>
                    <p>{result.message}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-4">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2">Mensaje que recibirás:</p>
          <p className="text-xs text-blue-800 dark:text-blue-200">
            Se enviará el template <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">hello_world</code> que
            viene preaprobado en todo WhatsApp Business Account.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
