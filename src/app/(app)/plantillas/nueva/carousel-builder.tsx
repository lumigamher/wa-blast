"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export type CardButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export type BuilderCard = {
  headerFormat: "IMAGE" | "VIDEO";
  handle: string | null;     // Meta example handle
  publicUrl: string | null;  // hosted link for sending
  assetId: string | null;
  body: string;
  bodyExample: string;
  buttons: CardButton[];
};

export type CarouselValue = { cards: BuilderCard[] };

export const emptyCard = (): BuilderCard => ({
  headerFormat: "IMAGE", handle: null, publicUrl: null, assetId: null,
  body: "", bodyExample: "", buttons: [{ type: "URL", text: "Ver", url: "" }],
});

export function CarouselBuilder({ value, onChange }: { value: CarouselValue; onChange: (v: CarouselValue) => void }) {
  const [uploading, setUploading] = useState<number | null>(null);
  const cards = value.cards;

  function patch(i: number, p: Partial<BuilderCard>) {
    onChange({ cards: cards.map((c, idx) => (idx === i ? { ...c, ...p } : c)) });
  }

  async function upload(i: number, file: File) {
    setUploading(i);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/meta/upload-media", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      patch(i, { handle: data.handle, publicUrl: data.publicUrl, assetId: data.assetId, headerFormat: data.format === "VIDEO" ? "VIDEO" : "IMAGE" });
      toast.success("Media subida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Tarjetas del carrusel ({cards.length}/10)</Label>
        <Button type="button" variant="outline" size="sm" disabled={cards.length >= 10}
          onClick={() => onChange({ cards: [...cards, emptyCard()] })}>
          <PlusIcon className="size-4" /> Agregar tarjeta
        </Button>
      </div>
      {cards.map((card, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tarjeta {i + 1}</span>
              <Button type="button" variant="ghost" size="sm" disabled={cards.length <= 2}
                onClick={() => onChange({ cards: cards.filter((_, idx) => idx !== i) })}>
                <Trash2Icon className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <input id={`media-${i}`} type="file" accept="image/jpeg,image/png,video/mp4" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(i, f); }} />
              <Button type="button" variant="outline" size="sm" disabled={uploading === i}
                onClick={() => document.getElementById(`media-${i}`)?.click()}>
                <UploadIcon className="size-4" /> {uploading === i ? "Subiendo…" : card.publicUrl ? "Cambiar media" : "Subir imagen/video"}
              </Button>
              {card.publicUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{card.headerFormat}</span>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto de la tarjeta (usa {"{{1}}"} para variables, máx 160)</Label>
              <Input maxLength={160} value={card.body} onChange={(e) => patch(i, { body: e.target.value })} />
            </div>
            {card.buttons.map((b, bi) => (
              <div key={bi} className="grid grid-cols-2 gap-2">
                <Input placeholder="Texto del botón" value={b.text}
                  onChange={(e) => patch(i, { buttons: card.buttons.map((x, idx) => idx === bi ? { ...x, text: e.target.value } : x) })} />
                {b.type === "URL" && (
                  <Input placeholder="https://… (puede llevar {{1}})" value={(b as { url: string }).url}
                    onChange={(e) => patch(i, { buttons: card.buttons.map((x, idx) => idx === bi ? { ...x, url: e.target.value } : x) })} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {cards.length < 2 && <p className="text-xs text-destructive">El carrusel necesita al menos 2 tarjetas.</p>}
    </div>
  );
}
