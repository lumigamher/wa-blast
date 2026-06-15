"use client";

import { useRef, useState } from "react";
import { StickerIcon, PlusIcon } from "lucide-react";
import { addStickerAction, sendStickerAction } from "../../actions";

type Sticker = { id: string; assetId: string };

export function StickerPicker({
  conversationId,
  stickers,
  disabled,
  replyToWamid,
}: {
  conversationId: string;
  stickers: Sticker[];
  disabled?: boolean;
  replyToWamid?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const buf = await f.arrayBuffer();
    let bin = "";
    new Uint8Array(buf).forEach((b) => {
      bin += String.fromCharCode(b);
    });
    setBusy(true);
    await addStickerAction({ dataBase64: btoa(bin) });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSend = async (id: string) => {
    setBusy(true);
    await sendStickerAction(conversationId, { stickerId: id, replyTo: replyToWamid });
    setBusy(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Stickers"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <StickerIcon className="size-5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border bg-background p-3 shadow-lg">
          <div className="grid grid-cols-4 gap-2">
            {stickers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSend(s.id)}
                disabled={busy}
                aria-label="Enviar sticker"
                className="rounded hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/inbox/media/${s.assetId}`}
                  alt="sticker"
                  className="size-12 object-contain"
                />
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Añadir sticker"
              className="flex size-12 items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <PlusIcon className="size-5" />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onAdd}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
