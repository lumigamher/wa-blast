"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addVariantAction,
  deleteVariantAction,
  setVariantAvailableAction,
  addImageUrlAction,
  deleteImageAction,
} from "./actions";

type Product = {
  id: string;
  name: string;
  priceCop: number;
};

type Variant = {
  id: string;
  label: string;
  priceCop: number | null;
  sku: string | null;
  available: boolean;
};

type Image = {
  id: string;
  url: string;
  label: string | null;
  variantId: string | null;
};

export function ProductDetail({
  product,
  variants,
  images,
  open,
  onOpenChange,
}: {
  product: Product;
  variants: Variant[];
  images: Image[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Variant form state
  const [variantForm, setVariantForm] = useState({ label: "", priceCop: "", sku: "" });

  // Image URL form state
  const [imageUrlForm, setImageUrlForm] = useState({ url: "", label: "", variantId: "" });

  // Image upload form state
  const [imageUploadForm, setImageUploadForm] = useState({ file: null as File | null, label: "", variantId: "" });

  const [deleteVariantId, setDeleteVariantId] = useState<string | null>(null);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);

  const handleAddVariant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!variantForm.label.trim()) {
      toast.error("La etiqueta es requerida");
      return;
    }
    startTransition(async () => {
      const result = await addVariantAction(product.id, {
        label: variantForm.label,
        priceCop: variantForm.priceCop ? Number(variantForm.priceCop) : null,
        sku: variantForm.sku || null,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Variante agregada");
        setVariantForm({ label: "", priceCop: "", sku: "" });
        router.refresh();
      }
    });
  };

  const handleDeleteVariant = (variantId: string) => {
    startTransition(async () => {
      const result = await deleteVariantAction(variantId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Variante eliminada");
        setDeleteVariantId(null);
        router.refresh();
      }
    });
  };

  const handleToggleVariantAvailable = (variantId: string, currentAvailable: boolean) => {
    startTransition(async () => {
      const result = await setVariantAvailableAction(variantId, !currentAvailable);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(currentAvailable ? "Variante desactivada" : "Variante activada");
        router.refresh();
      }
    });
  };

  const handleAddImageUrl = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!imageUrlForm.url.trim()) {
      toast.error("La URL es requerida");
      return;
    }
    startTransition(async () => {
      const result = await addImageUrlAction(product.id, {
        url: imageUrlForm.url.trim(),
        label: imageUrlForm.label || null,
        variantId: imageUrlForm.variantId || null,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Imagen agregada");
        setImageUrlForm({ url: "", label: "", variantId: "" });
        router.refresh();
      }
    });
  };

  const handleUploadImage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!imageUploadForm.file) {
      toast.error("Selecciona un archivo");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", imageUploadForm.file as Blob);
      if (imageUploadForm.label) formData.append("label", imageUploadForm.label);
      if (imageUploadForm.variantId) formData.append("variantId", imageUploadForm.variantId);

      try {
        const response = await fetch(`/api/products/${product.id}/images`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al subir imagen");
        }
        toast.success("Imagen subida");
        setImageUploadForm({ file: null, label: "", variantId: "" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir imagen");
      }
    });
  };

  const handleDeleteImage = (imageId: string) => {
    startTransition(async () => {
      const result = await deleteImageAction(imageId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Imagen eliminada");
        setDeleteImageId(null);
        router.refresh();
      }
    });
  };

  const basePrice = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(product.priceCop);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pt-6">
          {/* Variantes Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Variantes</h3>

            {/* Add variant form */}
            <form onSubmit={handleAddVariant} className="space-y-3 p-3 bg-muted/30 rounded-lg border border-muted">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="variant-label" className="text-xs">
                    Etiqueta
                  </Label>
                  <Input
                    id="variant-label"
                    value={variantForm.label}
                    onChange={(e) => setVariantForm({ ...variantForm, label: e.target.value })}
                    placeholder="Color, tamaño, etc."
                    disabled={isPending}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="variant-price" className="text-xs">
                    Precio (COP, opcional)
                  </Label>
                  <Input
                    id="variant-price"
                    type="number"
                    value={variantForm.priceCop}
                    onChange={(e) => setVariantForm({ ...variantForm, priceCop: e.target.value })}
                    placeholder="Dejar en blanco usa precio base"
                    disabled={isPending}
                    className="text-sm"
                    min="0"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variant-sku" className="text-xs">
                  SKU (opcional)
                </Label>
                <Input
                  id="variant-sku"
                  value={variantForm.sku}
                  onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                  placeholder="SKU único"
                  disabled={isPending}
                  className="text-sm"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={isPending}>
                  <PlusIcon className="size-3.5 mr-1.5" />
                  Agregar variante
                </Button>
              </div>
            </form>

            {/* Variants list */}
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin variantes. Usa el precio base.</p>
            ) : (
              <div className="space-y-2">
                {variants.map((variant) => {
                  const variantPrice = variant.priceCop
                    ? new Intl.NumberFormat("es-CO", {
                        style: "currency",
                        currency: "COP",
                        maximumFractionDigits: 0,
                      }).format(variant.priceCop)
                    : `Usa precio base (${basePrice})`;

                  return (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{variant.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {variantPrice}
                          {variant.sku && ` • SKU: ${variant.sku}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={variant.available ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => handleToggleVariantAvailable(variant.id, variant.available)}
                          disabled={isPending}
                        >
                          {variant.available ? "Activa" : "Inactiva"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            if (deleteVariantId === variant.id) {
                              handleDeleteVariant(variant.id);
                            } else {
                              setDeleteVariantId(variant.id);
                            }
                          }}
                          disabled={isPending}
                        >
                          {deleteVariantId === variant.id ? (
                            <span className="text-xs">OK</span>
                          ) : (
                            <Trash2Icon className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Imágenes Section */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium text-sm">Imágenes</h3>

            {/* Add image by URL form */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Agregar por URL</p>
              <form onSubmit={handleAddImageUrl} className="space-y-3 p-3 bg-muted/30 rounded-lg border border-muted">
                <div className="space-y-1.5">
                  <Label htmlFor="image-url" className="text-xs">
                    URL de la imagen
                  </Label>
                  <Input
                    id="image-url"
                    value={imageUrlForm.url}
                    onChange={(e) => setImageUrlForm({ ...imageUrlForm, url: e.target.value })}
                    placeholder="https://..."
                    disabled={isPending}
                    className="text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="image-label" className="text-xs">
                      Etiqueta (opcional)
                    </Label>
                    <Input
                      id="image-label"
                      value={imageUrlForm.label}
                      onChange={(e) => setImageUrlForm({ ...imageUrlForm, label: e.target.value })}
                      placeholder="Ej: Vista frontal"
                      disabled={isPending}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="image-url-variant" className="text-xs">
                      Variante (opcional)
                    </Label>
                    <Select
                      value={imageUrlForm.variantId ?? ""}
                      onValueChange={(v: string | null) => setImageUrlForm({ ...imageUrlForm, variantId: v ?? "" })}
                      disabled={isPending}
                    >
                      <SelectTrigger id="image-url-variant" className="text-sm h-9">
                        <SelectValue placeholder="Sin variante" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Sin variante</SelectItem>
                        {variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={isPending}>
                    <PlusIcon className="size-3.5 mr-1.5" />
                    Agregar URL
                  </Button>
                </div>
              </form>
            </div>

            {/* Upload image form */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">O subir archivo</p>
              <form onSubmit={handleUploadImage} className="space-y-3 p-3 bg-muted/30 rounded-lg border border-muted">
                <div className="space-y-1.5">
                  <Label htmlFor="image-file" className="text-xs">
                    Archivo
                  </Label>
                  <Input
                    id="image-file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageUploadForm({ ...imageUploadForm, file: e.target.files?.[0] ?? null })}
                    disabled={isPending}
                    className="text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="upload-label" className="text-xs">
                      Etiqueta (opcional)
                    </Label>
                    <Input
                      id="upload-label"
                      value={imageUploadForm.label}
                      onChange={(e) => setImageUploadForm({ ...imageUploadForm, label: e.target.value })}
                      placeholder="Ej: Vista frontal"
                      disabled={isPending}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="upload-variant" className="text-xs">
                      Variante (opcional)
                    </Label>
                    <Select
                      value={imageUploadForm.variantId ?? ""}
                      onValueChange={(v: string | null) => setImageUploadForm({ ...imageUploadForm, variantId: v ?? "" })}
                      disabled={isPending}
                    >
                      <SelectTrigger id="upload-variant" className="text-sm h-9">
                        <SelectValue placeholder="Sin variante" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Sin variante</SelectItem>
                        {variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={isPending}>
                    <PlusIcon className="size-3.5 mr-1.5" />
                    Subir imagen
                  </Button>
                </div>
              </form>
            </div>

            {/* Images list */}
            {images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin imágenes aún.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {images.map((image) => {
                  const variantLabel = variants.find((v) => v.id === image.variantId)?.label;
                  return (
                    <div
                      key={image.id}
                      className="relative group rounded-lg border border-border overflow-hidden bg-muted/50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={image.label ?? "Product image"}
                        className="h-24 w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 w-6 p-0 ml-auto"
                          onClick={() => {
                            if (deleteImageId === image.id) {
                              handleDeleteImage(image.id);
                            } else {
                              setDeleteImageId(image.id);
                            }
                          }}
                          disabled={isPending}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </div>
                      <div className="p-2 space-y-1">
                        {image.label && <p className="text-xs font-medium truncate">{image.label}</p>}
                        {variantLabel && <p className="text-xs text-muted-foreground">{variantLabel}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
