"use client";

import { useState, useRef } from "react";
import { XIcon, Trash2Icon, NotebookPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { addNoteAction, deleteNoteAction } from "../../actions";

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
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Sin notas todavía</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 flex-1 overflow-y-auto">
      {notes.map((note) => (
        <div
          key={note.id}
          className="rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-1.5"
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

function AddNoteForm({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const handleAdd = async () => {
    if (!body.trim()) return;
    setAdding(true);
    const result = await addNoteAction(conversationId, body);
    setAdding(false);
    if (result.ok) {
      setBody("");
      if (textareaRef.current) textareaRef.current.value = "";
      router.refresh();
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Añade una nota interna…"
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        rows={3}
      />
      <button
        onClick={handleAdd}
        disabled={adding || !body.trim()}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {adding ? "Añadiendo…" : "Añadir"}
      </button>
    </div>
  );
}

export function NotesToggle({
  conversationId,
  notes,
}: {
  conversationId: string;
  notes: Note[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Notas internas"
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <NotebookPenIcon className="size-5" />
        {notes.length > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">
            {notes.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-20 w-80 border-l bg-card flex flex-col shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h3 className="font-semibold text-sm">Notas internas</h3>
              <p className="text-xs text-muted-foreground">Solo tu equipo las ve</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar panel de notas"
              className="rounded-full p-1 hover:bg-muted transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          <NotesList notes={notes} conversationId={conversationId} />

          <AddNoteForm conversationId={conversationId} />
        </div>
      )}
    </>
  );
}
