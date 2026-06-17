"use client";

import { useState } from "react";
import {
  XIcon,
  Trash2Icon,
  UserIcon,
  MessageCircleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteNoteAction } from "../../actions";
import { ContactAvatar } from "./contact-avatar";
import { CallButton } from "../../../_components/call-button";

type Note = {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const intervals = {
    hour: 3600,
    minute: 60,
  };

  for (const [key, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      if (interval === 1) return `Hace 1 ${key}`;
      return `Hace ${interval} ${key}s`;
    }
  }
  return "Hace unos segundos";
}

function NotesList({ notes, conversationId }: { notes: Note[]; conversationId: string }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = async (noteId: string) => {
    setDeleting(noteId);
    await deleteNoteAction(conversationId, noteId);
    router.refresh();
    setDeleting(null);
  };

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <p className="text-xs text-muted-foreground">Sin notas todavía</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-64">
      {notes.map((note) => (
        <div
          key={note.id}
          className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 p-2.5 space-y-1.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-amber-900 dark:text-amber-400">
                {note.authorName}
              </div>
              <div className="text-[10px] text-amber-700 dark:text-amber-500">
                {formatRelativeTime(note.createdAt)}
              </div>
            </div>
            <button
              onClick={() => handleDelete(note.id)}
              disabled={deleting === note.id}
              aria-label="Eliminar nota"
              className="flex-shrink-0 rounded p-1 text-amber-600 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
          <p className="text-xs text-amber-900 dark:text-amber-300 break-words whitespace-pre-wrap">
            {note.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ContactInfoToggle({
  conversationId,
  contact,
  contactId,
  phone,
  notes,
}: {
  conversationId: string;
  contact: { name?: string | null } | null;
  contactId?: string | null;
  phone: string;
  notes: Note[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Información del contacto"
        className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <UserIcon className="size-4" />
      </button>

      {open && (
        <div className="absolute inset-y-0 right-0 z-20 w-80 border-l bg-card flex flex-col shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Información del contacto</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar panel"
              className="rounded-full p-1 hover:bg-muted transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 px-4 py-4">
            {/* Contact Card */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ContactAvatar
                  seed={phone}
                  name={contact?.name ?? null}
                  size={48}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {contact?.name || phone}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageCircleIcon className="size-3" />
                    <span>WhatsApp · {phone}</span>
                  </div>
                </div>
              </div>
              {contactId && (
                <CallButton contactId={contactId} name={contact?.name ?? null} phone={phone} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50" />
              )}
            </div>

            {/* Internal Notes Section */}
            <div className="space-y-2">
              <div className="text-sm font-semibold">Notas internas</div>
              <div className="text-xs text-muted-foreground mb-2">
                Solo tu equipo las ve
              </div>
              <NotesList notes={notes} conversationId={conversationId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
