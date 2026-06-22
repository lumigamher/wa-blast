"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2Icon, ChevronDownIcon, SearchIcon, UploadIcon,
  ToggleLeftIcon, ToggleRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProductAction, deleteProductAction,
  setProductAvailableAction, setProductsAvailableAction,
} from "./actions";
import { ProductDetail } from "./_product-detail";
import type { products as productsSchema } from "@/lib/db/schema";

type Product = typeof productsSchema.$inferSelect;
type ProductWithDetails = Product & {
  variants: Array<{ id: string; label: string; priceCop: number | null; sku: string | null; available: boolean }>;
  images: Array<{ id: string; url: string; label: string | null; variantId: string | null }>;
};

export function AgentProducts({
  items, total, page, pageSize, search,
}: {
  items: ProductWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", priceCop: 0, description: "", sku: "" });
  const [query, setQuery] = useState(search);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goSearch() {
    router.push(`/configuracion/agente/catalogo?q=${encodeURIComponent(query.trim())}&page=1`);
  }
  function goPage(p: number) {
    router.push(`/configuracion/agente/catalogo?q=${encodeURIComponent(search)}&page=${p}`);
  }
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function bulkAvailable(available: boolean) {
    startTransition(async () => {
      const res = await setProductsAvailableAction([...selected], available);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(available ? "Marcados disponibles" : "Marcados agotados");
      setSelected(new Set());
      router.refresh();
    });
  }
  function toggleOne(id: string, current: boolean) {
    startTransition(async () => {
      const res = await setProductAvailableAction(id, !current);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    if (form.priceCop < 0) { toast.error("El precio debe ser mayor o igual a 0"); return; }
    startTransition(async () => {
      const result = await addProductAction({
        name: form.name, priceCop: form.priceCop,
        description: form.description || undefined, sku: form.sku || undefined,
      });
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Producto agregado");
      setForm({ name: "", priceCop: 0, description: "", sku: "" });
      router.refresh();
    });
  };
  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteProductAction(id);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Producto eliminado");
      setDeleteId(null);
      router.refresh();
    });
  };

  const priceFmt = (cop: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cop);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Productos</CardTitle>
        <CardDescription className="text-xs">
          Catálogo interno. Busca, marca disponibilidad o carga masiva por Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") goSearch(); }}
              placeholder="Buscar por nombre o SKU…"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={goSearch}>Buscar</Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/configuracion/agente/catalogo/importar")}>
            <UploadIcon className="size-4 mr-1.5" /> Importar XLSX
          </Button>
        </div>

        {/* Barra de selección */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span>{selected.size} seleccionado(s)</span>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => bulkAvailable(true)}>Marcar disponibles</Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => bulkAvailable(false)}>Marcar agotados</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpiar</Button>
          </div>
        )}

        {/* Add form (conservar el existente) */}
        <form onSubmit={handleAdd} className="space-y-4 p-4 bg-muted/30 rounded-lg border border-muted">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-name">Nombre</Label>
              <Input id="prod-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="iPhone 15" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-price">Precio (COP)</Label>
              <Input id="prod-price" type="number" value={form.priceCop} onChange={(e) => setForm({ ...form, priceCop: Number(e.target.value) })} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Descripción</Label>
            <Input id="prod-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Breve descripción" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-sku">SKU</Label>
            <Input id="prod-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU único" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending}>Agregar producto</Button>
          </div>
        </form>

        {/* Lista */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "Sin resultados para tu búsqueda." : "No hay productos aún."}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((product) => {
              const variantCount = product.variants.length;
              const imageCount = product.images.length;
              return (
                <div key={product.id}>
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                      className="size-4 shrink-0"
                      aria-label={`Seleccionar ${product.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium truncate">{product.name}</h4>
                        {!product.available && (
                          <span className="text-[10px] font-medium text-red-600 border border-red-300 rounded px-1.5 py-0.5">Agotado</span>
                        )}
                      </div>
                      {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                      <div className="flex gap-4 mt-1.5">
                        <span className="text-xs text-muted-foreground">{variantCount} variante{variantCount !== 1 ? "s" : ""}</span>
                        <span className="text-xs text-muted-foreground">{imageCount} imagen{imageCount !== 1 ? "es" : ""}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-foreground whitespace-nowrap">{priceFmt(product.priceCop)}</span>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={isPending}
                        title={product.available ? "Marcar agotado" : "Marcar disponible"}
                        onClick={() => toggleOne(product.id, product.available)}>
                        {product.available ? <ToggleRightIcon className="size-4 text-emerald-600" /> : <ToggleLeftIcon className="size-4 text-muted-foreground" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2" disabled={isPending} onClick={() => setDetailOpen(product.id)}>
                        <ChevronDownIcon className="size-4" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={isPending}
                        onClick={() => { if (deleteId === product.id) handleDelete(product.id); else setDeleteId(product.id); }}>
                        {deleteId === product.id ? <span className="text-xs">¿Seguro?</span> : <Trash2Icon className="size-4" />}
                      </Button>
                    </div>
                  </div>
                  {detailOpen === product.id && (
                    <ProductDetail
                      product={product} variants={product.variants} images={product.images}
                      open={detailOpen === product.id}
                      onOpenChange={(open) => setDetailOpen(open ? product.id : null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {total > pageSize && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => goPage(page - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
