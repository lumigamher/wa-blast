"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addTextDocumentAction, deleteDocumentAction } from "./actions";

const MAX_MB = 2;
const ACCEPT = ".pdf,.txt,.md,text/plain,text/markdown,application/pdf";

type DocItem = {
  id: string;
  name: string;
  status: "indexando" | "listo" | "error";
  chunkCount: number;
  source: "upload" | "text";
};

const STATUS: Record<DocItem["status"], { label: string; cls: string }> = {
  indexando: { label: "Indexando…", cls: "text-amber-600" },
  listo: { label: "Listo", cls: "text-emerald-600" },
  error: { label: "Error", cls: "text-red-600" },
};

export function AgentDocuments({ items }: { items: DocItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    for (const file of list) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`"${file.name}" supera ${MAX_MB} MB`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/agent/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? `No se pudo subir "${file.name}"`);
      } else {
        toast.success(`"${file.name}" indexado`);
      }
    }
    setUploading(false);
    router.refresh();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  }

  function onAddText() {
    start(async () => {
      const res = await addTextDocumentAction({ name, text });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Texto agregado");
      setName("");
      setText("");
      router.refresh();
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const res = await deleteDocumentAction(id);
      if ("error" in res) toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Base de conocimiento</CardTitle>
        <CardDescription className="text-xs">
          Arrastra documentos (PDF, .txt, .md) o pega texto. El agente responderá con esta información. Máx 20 documentos, {MAX_MB} MB c/u.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={uploading}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          <UploadIcon className="size-6 text-muted-foreground" />
          <span className="text-sm font-medium">
            {uploading ? "Subiendo…" : "Arrastra archivos aquí o haz clic para explorar"}
          </span>
          <span className="text-xs text-muted-foreground">PDF, TXT o Markdown · máx {MAX_MB} MB</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </button>

        <div className="space-y-2 border-t border-border pt-4">
          <Input placeholder="Nombre (ej: Políticas de envío)" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            placeholder="O pega aquí el texto…"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button onClick={onAddText} disabled={pending || !text.trim()} size="sm">
            Agregar texto
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
          ) : (
            items.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{doc.name}</span>
                  <Badge variant="outline" className={STATUS[doc.status].cls}>
                    {STATUS[doc.status].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{doc.chunkCount} frag.</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(doc.id)} disabled={pending}>
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
