"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveCatalogAction } from "./actions";
import type { CatalogInput } from "@/lib/agent/admin";

export function AgentCatalog({
  provider,
  config,
}: {
  provider: "internal" | "http" | "shopify" | "medusa";
  config: Record<string, unknown>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [values, setValues] = useState({
    provider,
    url: (config.url as string) ?? "",
    apiKey: "",
    nameField: (config.nameField as string) ?? "name",
    priceField: (config.priceField as string) ?? "price",
    idField: (config.idField as string) ?? "id",
    shop: (config.shop as string) ?? "",
    storefrontToken: "",
    backendUrl: (config.backendUrl as string) ?? "",
    publishableKey: "",
    regionId: (config.regionId as string) ?? "",
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        let input: CatalogInput;
        if (values.provider === "internal") {
          input = { provider: "internal", credentials: {}, config: {} };
        } else if (values.provider === "http") {
          input = {
            provider: "http",
            credentials: { apiKey: values.apiKey },
            config: {
              url: values.url,
              nameField: values.nameField,
              priceField: values.priceField,
              idField: values.idField,
            },
          };
        } else if (values.provider === "shopify") {
          input = {
            provider: "shopify",
            credentials: { storefrontToken: values.storefrontToken },
            config: { shop: values.shop },
          };
        } else {
          input = {
            provider: "medusa",
            credentials: { publishableKey: values.publishableKey },
            config: {
              backendUrl: values.backendUrl,
              regionId: values.regionId,
            },
          };
        }
        const result = await saveCatalogAction(input);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success("Catálogo guardado");
          router.refresh();
          setValues({ ...values, apiKey: "", storefrontToken: "", publishableKey: "" });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo de productos</CardTitle>
        <CardDescription className="text-xs">
          Configura dónde el agente obtiene la información de productos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Provider select */}
          <div className="space-y-1.5">
            <Label htmlFor="catalog-provider">Proveedor</Label>
            <Select
              value={values.provider}
              onValueChange={(v) => {
                if (v === "internal" || v === "http" || v === "shopify" || v === "medusa") {
                  setValues({ ...values, provider: v });
                }
              }}
            >
              <SelectTrigger id="catalog-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Interno (gestiona tú)</SelectItem>
                <SelectItem value="http">HTTP API</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="medusa">Medusa v2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Internal provider note */}
          {values.provider === "internal" && (
            <div className="rounded-md bg-muted/50 border border-muted p-3">
              <p className="text-xs text-muted-foreground">
                Gestiona tus productos en la sección &quot;Catálogo interno&quot; abajo.
              </p>
            </div>
          )}

          {/* HTTP provider fields */}
          {values.provider === "http" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="http-url">URL de la API</Label>
                <Input
                  id="http-url"
                  value={values.url}
                  onChange={(e) => setValues({ ...values, url: e.target.value })}
                  placeholder="https://api.ejemplo.com/productos"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="http-api-key">API Key</Label>
                <Input
                  id="http-api-key"
                  type="password"
                  value={values.apiKey}
                  onChange={(e) => setValues({ ...values, apiKey: e.target.value })}
                  placeholder={provider === "http" ? "•••• (déjalo vacío para no cambiarla)" : "Ingresa tu API key"}
                />
                {provider === "http" && (
                  <p className="text-xs text-muted-foreground">
                    Déjalo vacío para mantener la existente.
                  </p>
                )}
              </div>

              {/* Advanced fields */}
              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Avanzado
                  <ChevronDownIcon className={`size-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="name-field">Campo de nombre</Label>
                      <Input
                        id="name-field"
                        value={values.nameField}
                        onChange={(e) => setValues({ ...values, nameField: e.target.value })}
                        placeholder="name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="price-field">Campo de precio</Label>
                      <Input
                        id="price-field"
                        value={values.priceField}
                        onChange={(e) => setValues({ ...values, priceField: e.target.value })}
                        placeholder="price"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="id-field">Campo de ID</Label>
                      <Input
                        id="id-field"
                        value={values.idField}
                        onChange={(e) => setValues({ ...values, idField: e.target.value })}
                        placeholder="id"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Shopify provider fields */}
          {values.provider === "shopify" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="shopify-shop">Nombre de tienda</Label>
                <Input
                  id="shopify-shop"
                  value={values.shop}
                  onChange={(e) => setValues({ ...values, shop: e.target.value })}
                  placeholder="tu-tienda.myshopify.com"
                />
                <p className="text-xs text-muted-foreground">
                  Ej: mitienda.myshopify.com
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shopify-token">Storefront Access Token</Label>
                <Input
                  id="shopify-token"
                  type="password"
                  value={values.storefrontToken}
                  onChange={(e) => setValues({ ...values, storefrontToken: e.target.value })}
                  placeholder={provider === "shopify" ? "•••• (déjalo vacío para no cambiarla)" : "Ingresa tu token"}
                />
                {provider === "shopify" && (
                  <p className="text-xs text-muted-foreground">
                    Déjalo vacío para mantener el existente.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Medusa provider fields */}
          {values.provider === "medusa" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="medusa-backend-url">URL del Backend</Label>
                <Input
                  id="medusa-backend-url"
                  value={values.backendUrl}
                  onChange={(e) => setValues({ ...values, backendUrl: e.target.value })}
                  placeholder="https://api.ejemplo.com"
                />
                <p className="text-xs text-muted-foreground">
                  Ej: https://api.mimedusa.com
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="medusa-publishable-key">Publishable Key</Label>
                <Input
                  id="medusa-publishable-key"
                  type="password"
                  value={values.publishableKey}
                  onChange={(e) => setValues({ ...values, publishableKey: e.target.value })}
                  placeholder={provider === "medusa" ? "•••• (déjalo vacío para no cambiarla)" : "Ingresa tu publishable key"}
                />
                {provider === "medusa" && (
                  <p className="text-xs text-muted-foreground">
                    Déjalo vacío para mantener el existente.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="medusa-region-id">Region ID (opcional)</Label>
                <Input
                  id="medusa-region-id"
                  value={values.regionId}
                  onChange={(e) => setValues({ ...values, regionId: e.target.value })}
                  placeholder="Ej: reg_XXX"
                />
                <p className="text-xs text-muted-foreground">
                  Si está vacío, se detectará automáticamente de la API.
                </p>
              </div>
            </>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
