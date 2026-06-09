"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateFlowAction, createFlowAction, previewFlowAction } from "./actions";
import type { FlowCategory } from "@/lib/meta/flows";

const CATEGORIES: { value: FlowCategory; label: string }[] = [
  { value: "LEAD_GENERATION", label: "Captura de leads" },
  { value: "SIGN_UP", label: "Registro" },
  { value: "APPOINTMENT_BOOKING", label: "Agendamiento" },
  { value: "SURVEY", label: "Encuesta" },
  { value: "CONTACT_US", label: "Contacto" },
  { value: "CUSTOMER_SUPPORT", label: "Soporte" },
  { value: "SIGN_IN", label: "Inicio de sesión" },
  { value: "OTHER", label: "Otro" },
];

const SAMPLE = '{\n  "version": "6.3",\n  "screens": []\n}';

export function FlowForm() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FlowCategory>("LEAD_GENERATION");
  const [request, setRequest] = useState("");
  const [flowJson, setFlowJson] = useState(SAMPLE);
  const [generating, startGen] = useTransition();
  const [creating, startCreate] = useTransition();
  const [previewing, startPreview] = useTransition();

  const jsonValid = (() => { try { JSON.parse(flowJson); return true; } catch { return false; } })();

  function generate() {
    if (!request.trim()) { toast.error("Describe el formulario"); return; }
    startGen(async () => {
      const res = await generateFlowAction(request);
      if (!res.ok) { toast.error(res.error); return; }
      setFlowJson(res.flowJson);
      toast.success("Flow generado — revísalo y publícalo");
    });
  }
  function create() {
    startCreate(async () => {
      const res = await createFlowAction({ name, category, flowJson });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Flow "${name}" creado (${res.status}) · id ${res.id}`, { duration: 8000 });
      setName(""); setRequest(""); setFlowJson(SAMPLE);
    });
  }

  function preview() {
    startPreview(async () => {
      const res = await previewFlowAction({ name, flowJson });
      if (!res.ok) { toast.error(res.error); return; }
      window.open(res.previewUrl, "_blank");
      toast.success("Vista previa abierta en otra pestaña");
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><SparklesIcon className="size-4" /> Generar con IA</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="req" className="text-xs">Describe el formulario que quieres (campos, opciones…)</Label>
          <textarea id="req" value={request} onChange={(e) => setRequest(e.target.value)} rows={3}
            placeholder="Captura de leads para mi restaurante: nombre, teléfono, y un menú desplegable con qué busca (almuerzo, evento, domicilio)."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <Button type="button" onClick={generate} disabled={generating}>{generating ? "Generando…" : "Generar Flow"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="name">Nombre del Flow</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Captura leads restaurante" /></div>
          <div><Label>Categoría</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as FlowCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Flow JSON</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <textarea value={flowJson} onChange={(e) => setFlowJson(e.target.value)} rows={18} spellCheck={false}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" />
          <p className={`text-[11px] ${jsonValid ? "text-muted-foreground" : "text-destructive"}`}>{jsonValid ? "JSON válido. Meta lo validará al publicar." : "JSON inválido"}</p>
          <p className="text-[11px] text-muted-foreground">Crea un borrador en Meta y abre su vista previa oficial.</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/flows" className="text-sm text-muted-foreground hover:underline">Cancelar</Link>
        <Button variant="outline" onClick={preview} disabled={previewing || !jsonValid} size="lg">
          {previewing ? "Previsualizando…" : "Previsualizar"}
        </Button>
        <Button onClick={create} disabled={creating || !jsonValid || !name.trim()} size="lg">{creating ? "Publicando…" : "Crear y publicar en Meta"}</Button>
      </div>
    </div>
  );
}
