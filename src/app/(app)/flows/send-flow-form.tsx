"use client";

import { useState, useTransition, ChangeEvent } from "react";
import { ChevronDownIcon } from "lucide-react";
import { read, utils } from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { sendFlowAction, sendFlowBatchAction } from "./nueva/actions";

export function SendFlowForm({ flowId, flowName }: { flowId: string; flowName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [phone, setPhone] = useState("");
  const [phones, setPhones] = useState("");
  const [cta, setCta] = useState("Abrir formulario");
  const [bodyText, setBodyText] = useState("Completa este breve formulario 🙌");
  const [isPending, startTransition] = useTransition();

  const handleSendSingle = () => {
    startTransition(async () => {
      const result = await sendFlowAction({
        flowId,
        flowName,
        to: phone,
        cta,
        bodyText,
      });

      if (result.ok) {
        toast.success(`Flow enviado (wamid: ${result.wamid})`);
        setPhone("");
        setCta("Abrir formulario");
        setBodyText("Completa este breve formulario 🙌");
        setIsOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  const onExcel = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-subir el mismo archivo
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = read(ev.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
        if (!rows.length) {
          toast.error("El Excel está vacío");
          return;
        }
        const header = (rows[0] ?? []).map((h) => String(h ?? "").toLowerCase());
        const KEYS = ["tel", "phone", "cel", "whats", "numero", "número", "movil", "móvil", "contacto"];
        let col = header.findIndex((h) => KEYS.some((k) => h.includes(k)));
        let start = 1;
        if (col === -1) {
          col = 0;
          start = 0;
        } // sin encabezado reconocible → primera columna
        const nums: string[] = [];
        for (let i = start; i < rows.length; i++) {
          const raw = String((rows[i] ?? [])[col] ?? "").replace(/[^0-9+]/g, "");
          if (raw.replace(/\D/g, "").length >= 7) nums.push(raw);
        }
        if (!nums.length) {
          toast.error("No encontré números de teléfono en el Excel");
          return;
        }
        setPhones((prev) => {
          const ex = prev.trim();
          return (ex ? ex + "\n" : "") + nums.join("\n");
        });
        toast.success(`${nums.length} números cargados del Excel`);
      } catch {
        toast.error("No pude leer el archivo");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSendBulk = () => {
    startTransition(async () => {
      const phoneList = phones
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const result = await sendFlowBatchAction({
        flowId,
        flowName,
        cta,
        bodyText,
        phones: phoneList,
      });

      if (result.ok) {
        toast.success(`Enviando Flow a ${result.total} números…`);
        setPhones("");
        setCta("Abrir formulario");
        setBodyText("Completa este breve formulario 🙌");
        setIsOpen(false);
        // Redirect to campaigns after a short delay
        setTimeout(() => {
          window.location.href = "/campanas";
        }, 1000);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="border-t pt-3 mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDownIcon className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        Enviar Flow
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3 bg-muted/40 p-3 rounded">
          {/* Mode tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setMode("single")}
              className={`px-3 py-2 text-xs font-medium ${
                mode === "single" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"
              }`}
            >
              Un número
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={`px-3 py-2 text-xs font-medium ${
                mode === "bulk" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"
              }`}
            >
              Varios números
            </button>
          </div>

          {/* CTA input (shared) */}
          <div>
            <Label htmlFor={`cta-${flowId}`} className="text-xs">
              Texto del botón (máx 25 caracteres)
            </Label>
            <Input
              id={`cta-${flowId}`}
              maxLength={25}
              value={cta}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCta(e.target.value)}
              disabled={isPending}
              className="mt-1"
            />
          </div>

          {/* Body text input (shared) */}
          <div>
            <Label htmlFor={`body-${flowId}`} className="text-xs">
              Mensaje
            </Label>
            <textarea
              id={`body-${flowId}`}
              value={bodyText}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBodyText(e.target.value)}
              disabled={isPending}
              rows={2}
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Single mode */}
          {mode === "single" && (
            <>
              <div>
                <Label htmlFor={`phone-${flowId}`} className="text-xs">
                  Número (WhatsApp)
                </Label>
                <Input
                  id={`phone-${flowId}`}
                  placeholder="+57..."
                  value={phone}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                  disabled={isPending}
                  className="mt-1"
                />
              </div>
              <Button onClick={handleSendSingle} disabled={isPending || !phone.trim()} size="sm" className="w-full">
                {isPending ? "Enviando..." : "Enviar"}
              </Button>
            </>
          )}

          {/* Bulk mode */}
          {mode === "bulk" && (
            <>
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded p-2 text-xs text-yellow-800 dark:text-yellow-200">
                ⚠️ El mensaje interactivo solo llega a contactos que te escribieron en las últimas 24 h (regla de
                Meta).
              </div>
              <div>
                <Label htmlFor={`xls-${flowId}`} className="text-xs">
                  Sube un Excel/CSV (detecto la columna de teléfono)
                </Label>
                <Input
                  id={`xls-${flowId}`}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={onExcel}
                  disabled={isPending}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`phones-${flowId}`} className="text-xs">
                  …o pégalos (uno por línea, ej: +57... o 57...)
                </Label>
                <textarea
                  id={`phones-${flowId}`}
                  value={phones}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPhones(e.target.value)}
                  disabled={isPending}
                  rows={6}
                  placeholder="+573001234567&#10;+573009876543&#10;57301234567"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <Button
                onClick={handleSendBulk}
                disabled={isPending || phones.trim().length === 0}
                size="sm"
                className="w-full"
              >
                {isPending
                  ? "Enviando..."
                  : `Enviar a ${phones.split("\n").filter((l) => l.trim().length > 0).length} números`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
