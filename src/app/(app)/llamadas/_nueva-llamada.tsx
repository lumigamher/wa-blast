"use client";

import { useState } from "react";
import { PhoneIcon, SearchIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { listContactsAction } from "../contactos/actions";

type Row = { id: string; name: string | null; phone: string | null };

export function NuevaLlamada() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  async function search(q: string) {
    const res = await listContactsAction(q || undefined);
    setRows(res.map((r) => ({ id: r.id, name: r.name, phone: r.phone })));
  }

  function call(r: Row) {
    window.dispatchEvent(
      new CustomEvent("lula:place-call", { detail: { contactId: r.id, name: r.name, phone: r.phone } }),
    );
    setOpen(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void search("");
      }}
    >
      <SheetTrigger className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
        <PhoneIcon className="size-4" /> Nueva llamada
      </SheetTrigger>
      <SheetContent className="px-4">
        <SheetHeader>
          <SheetTitle>Nueva llamada</SheetTitle>
        </SheetHeader>
        <div className="relative my-3">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar contacto…" className="pl-8" onChange={(e) => void search(e.target.value)} />
        </div>
        <div className="space-y-1 overflow-y-auto">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => call(r)}
              className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted"
            >
              <span>
                <span className="font-medium">{r.name || r.phone}</span>
                <span className="block text-xs text-muted-foreground">{r.phone}</span>
              </span>
              <PhoneIcon className="size-4 text-muted-foreground" />
            </button>
          ))}
          {rows.length === 0 && <p className="p-2 text-sm text-muted-foreground">Sin contactos</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
