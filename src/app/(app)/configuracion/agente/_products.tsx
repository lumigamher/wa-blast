"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addProductAction, deleteProductAction } from "./actions";
import type { products as productsSchema } from "@/lib/db/schema";

type Product = typeof productsSchema.$inferSelect;

export function AgentProducts({ items }: { items: Product[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", priceCop: 0, description: "", sku: "" });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (form.priceCop < 0) {
      toast.error("El precio debe ser mayor o igual a 0");
      return;
    }
    startTransition(async () => {
      const result = await addProductAction({
        name: form.name,
        priceCop: form.priceCop,
        description: form.description || undefined,
        sku: form.sku || undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Producto agregado");
        setForm({ name: "", priceCop: 0, description: "", sku: "" });
        router.refresh();
      }
    });
  };

  const handleDelete = (productId: string) => {
    startTransition(async () => {
      const result = await deleteProductAction(productId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Producto eliminado");
        setDeleteId(null);
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo interno</CardTitle>
        <CardDescription className="text-xs">
          Gestiona los productos que el agente puede ofrecer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add form */}
        <form onSubmit={handleAdd} className="space-y-4 p-4 bg-muted/30 rounded-lg border border-muted">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Nombre del producto</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="iPhone 15"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-price">Precio (COP)</Label>
              <Input
                id="product-price"
                type="number"
                value={form.priceCop}
                onChange={(e) => setForm({ ...form, priceCop: Number(e.target.value) })}
                placeholder="0"
                min="0"
                disabled={isPending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-description">Descripción (opcional)</Label>
            <Input
              id="product-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Breve descripción del producto"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-sku">SKU (opcional)</Label>
            <Input
              id="product-sku"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="SKU único"
              disabled={isPending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Agregando..." : "Agregar producto"}
            </Button>
          </div>
        </form>

        {/* Products list */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay productos aún. Agrega el primero arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((product) => {
              const priceFormatted = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(product.priceCop);

              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{product.name}</h4>
                    {product.description && (
                      <p className="text-xs text-muted-foreground truncate">{product.description}</p>
                    )}
                    {product.sku && (
                      <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-foreground whitespace-nowrap">
                      {priceFormatted}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (deleteId === product.id) {
                          handleDelete(product.id);
                        } else {
                          setDeleteId(product.id);
                        }
                      }}
                      disabled={isPending}
                      className="h-8 w-8 p-0"
                    >
                      {deleteId === product.id ? (
                        <span className="text-xs">¿Seguro?</span>
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
