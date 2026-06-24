"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon, ImageIcon, VideoIcon, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MediaItem } from "@/lib/agent/media-library";

export function MediaLibrary({ items }: { items: MediaItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploadForm, setUploadForm] = useState({ file: null as File | null, label: "" });
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const kindIcons = {
    image: ImageIcon,
    video: VideoIcon,
    document: FileIcon,
  };

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast.error("Selecciona un archivo");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", uploadForm.file as Blob);
      if (uploadForm.label) formData.append("label", uploadForm.label);

      try {
        const response = await fetch("/api/agent/media-library", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al subir archivo");
        }
        toast.success("Archivo subido");
        setUploadForm({ file: null, label: "" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir archivo");
      }
    });
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    startTransition(async () => {
      try {
        const response = await fetch("/api/agent/media-library", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al eliminar archivo");
        }
        toast.success("Archivo eliminado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar archivo");
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Biblioteca de archivos</CardTitle>
        <CardDescription>
          El agente puede enviar estos archivos por WhatsApp cuando el cliente los pida
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload section */}
        <form onSubmit={handleUpload} className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isPending) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !isPending) setUploadForm({ ...uploadForm, file: f });
            }}
            onClick={() => !isPending && inputRef.current?.click()}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-6 text-center text-xs transition-colors ${
              isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            } ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <span className="font-medium">
              {uploadForm.file ? uploadForm.file.name : "Arrastra un archivo o haz clic para explorar"}
            </span>
            <span className="text-muted-foreground">
              Imágenes, videos o documentos · máx 16MB
            </span>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] ?? null })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="media-label" className="text-xs">
              Etiqueta (opcional)
            </Label>
            <Input
              id="media-label"
              type="text"
              placeholder="Ej: Catálogo, Promoción, Manual"
              value={uploadForm.label}
              onChange={(e) => setUploadForm({ ...uploadForm, label: e.target.value })}
              disabled={isPending}
              className="text-xs"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !uploadForm.file}
            size="sm"
          >
            {isPending ? "Subiendo…" : "Subir archivo"}
          </Button>
        </form>

        {/* Media list */}
        {items.length > 0 && (
          <>
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium mb-3">Archivos ({items.length})</h3>
              <div className="space-y-2">
                {items.map((item) => {
                  const Icon = kindIcons[item.kind];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="size-4 flex-shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">{item.label}</span>
                        <span className="text-muted-foreground flex-shrink-0">
                          ({item.kind})
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        disabled={isPending || deletingId === item.id}
                        className="h-7 w-7 p-0 flex-shrink-0"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
