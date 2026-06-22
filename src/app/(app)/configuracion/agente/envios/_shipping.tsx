"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { saveShippingAction } from "../actions";
import type { ShippingConfig } from "@/lib/agent/integrations/shipping/config";
import type { MipaqueteCity } from "@/lib/agent/integrations/shipping/mipaquete";

export function AgentShipping({
  provider,
  originCityName,
  originCityCode,
  volumetricFactor,
  hasApiKey,
  ratesJson,
}: {
  provider: "mipaquete" | "manual";
  originCityName: string;
  originCityCode: string;
  volumetricFactor: number;
  hasApiKey: boolean;
  ratesJson: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState({
    provider,
    apiKey: "",
    originCityName,
    originCityCode,
    volumetricFactor,
    ratesJson,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MipaqueteCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<MipaqueteCity | null>(
    originCityCode ? { name: originCityName, code: originCityCode, department: "" } : null,
  );

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/agent/shipping/locations?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        if (res.status === 400) {
          toast.error("Configura tu API key de Mipaquete primero");
        } else {
          toast.error("Error al buscar ciudades");
        }
        setSearchResults([]);
        return;
      }
      const data = await res.json();
      setSearchResults(data.cities || []);
    } catch {
      toast.error("Error al conectar con el servicio de búsqueda");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectCity = useCallback((city: MipaqueteCity) => {
    setSelectedCity(city);
    setValues((v) => ({
      ...v,
      originCityName: city.name,
      originCityCode: city.code,
    }));
    setSearchQuery("");
    setSearchResults([]);
    toast.success(`Ciudad seleccionada: ${city.name}`);
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate provider-specific requirements
    if (values.provider === "mipaquete" && !values.apiKey && !hasApiKey) {
      toast.error("Pega tu API key de Mipaquete para guardar");
      return;
    }

    // Validate rates if manual provider
    if (values.provider === "manual") {
      try {
        const rates = JSON.parse(values.ratesJson);
        if (!Array.isArray(rates)) {
          toast.error("Las tarifas deben ser un array JSON");
          return;
        }
      } catch {
        toast.error("JSON de tarifas inválido");
        return;
      }
    }

    startTransition(async () => {
      try {
        const config: ShippingConfig = {
          provider: values.provider as "mipaquete" | "manual",
          credentials:
            values.provider === "mipaquete" && values.apiKey ? { apiKey: values.apiKey.trim() } : {},
          config: {
            originCityName: values.originCityName || undefined,
            originCityCode: values.originCityCode || undefined,
            volumetricFactor: values.volumetricFactor || 2500,
            rates: values.provider === "manual" ? JSON.parse(values.ratesJson) : undefined,
          },
        };

        const result = await saveShippingAction(config);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success("Envíos guardado");
          router.refresh();
          // Clear apiKey field after successful save
          setValues({ ...values, apiKey: "" });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Envíos (logística)</CardTitle>
        <CardDescription className="text-xs">
          Configura el proveedor de envíos y parámetros de cálculo de tarifas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Provider select */}
          <div className="space-y-1.5">
            <Label htmlFor="provider">Proveedor de envíos</Label>
            <Select
              value={values.provider}
              onValueChange={(v) => {
                if (v === "mipaquete" || v === "manual") {
                  setValues({ ...values, provider: v });
                }
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mipaquete">Mipaquete</SelectItem>
                <SelectItem value="manual">Tabla manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ciudad de origen */}
          <div className="space-y-1.5">
            <Label htmlFor="originCityName">Ciudad de origen</Label>
            <Input
              id="originCityName"
              value={values.originCityName}
              onChange={(e) => setValues({ ...values, originCityName: e.target.value })}
              placeholder="Bogotá"
              disabled={isPending}
            />
          </div>

          {/* Buscador de ciudad (solo Mipaquete) */}
          {values.provider === "mipaquete" && (
            <div className="space-y-2">
              <Label>Buscar ciudad por nombre</Label>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Ej: Medellín, Bogotá..."
                  disabled={isPending || isSearching}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || isSearching || searchQuery.length < 2}
                >
                  {isSearching ? "Buscando..." : "Buscar"}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="grid grid-cols-1 gap-1">
                  {searchResults.map((city) => (
                    <button
                      key={city.code}
                      type="button"
                      onClick={() => handleSelectCity(city)}
                      className="text-left px-3 py-2 text-sm rounded border border-muted hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring transition"
                    >
                      <div className="font-medium">{city.name}</div>
                      {city.department && (
                        <div className="text-xs text-muted-foreground">{city.department}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedCity && (
                <div className="px-3 py-2 text-sm rounded bg-muted/50 border border-muted">
                  <div className="font-medium">Seleccionado: {selectedCity.name}</div>
                  {selectedCity.department && (
                    <div className="text-xs text-muted-foreground">{selectedCity.department}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Código: <code>{selectedCity.code}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Código de ciudad (raw, visible para override) */}
          {values.provider === "mipaquete" && (
            <div className="space-y-1.5">
              <Label htmlFor="originCityCode">Código de ciudad (manual)</Label>
              <Input
                id="originCityCode"
                value={values.originCityCode}
                onChange={(e) => setValues({ ...values, originCityCode: e.target.value })}
                placeholder="Ej: 05001000"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Código interno de Mipaquete. Se actualiza automáticamente al buscar una ciudad.
              </p>
            </div>
          )}

          {/* Factor volumétrico */}
          <div className="space-y-1.5">
            <Label htmlFor="volumetricFactor">Factor volumétrico</Label>
            <Input
              id="volumetricFactor"
              type="number"
              value={values.volumetricFactor}
              onChange={(e) => setValues({ ...values, volumetricFactor: Number(e.target.value) })}
              placeholder="2500"
              disabled={isPending}
              min="1"
            />
            <p className="text-xs text-muted-foreground">
              Divisor para calcular peso volumétrico (cm³ / factor = kg). Default: 2500.
            </p>
          </div>

          {/* API key (solo Mipaquete) */}
          {values.provider === "mipaquete" && (
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API key de Mipaquete</Label>
              <Input
                id="apiKey"
                type="password"
                value={values.apiKey}
                onChange={(e) => setValues({ ...values, apiKey: e.target.value })}
                placeholder={hasApiKey ? "•••• (guardada)" : "Ingresa tu API key"}
                disabled={isPending}
              />
              {hasApiKey && (
                <p className="text-xs text-muted-foreground">
                  API key configurada. Déjalo vacío para mantener la existente, o pega una nueva para actualizar.
                </p>
              )}
            </div>
          )}

          {/* Tarifas (solo manual) */}
          {values.provider === "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="ratesJson">Tarifas (JSON)</Label>
              <textarea
                id="ratesJson"
                value={values.ratesJson}
                onChange={(e) => setValues({ ...values, ratesJson: e.target.value })}
                placeholder='[{"city":"Bogotá","maxWeightKg":1,"priceCop":8000,"deliveryDays":2}]'
                disabled={isPending}
                className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Array JSON con objeto de tarifa por ciudad. Campos: city (opcional, default tier), maxWeightKg, priceCop, deliveryDays.
              </p>
            </div>
          )}

          {/* Helper note */}
          <div className="rounded-md bg-muted/50 border border-muted p-3">
            <p className="text-xs text-muted-foreground">
              El agente usa esta configuración para estimar costos y tiempos de envío en base al peso y dimensiones del producto.
            </p>
          </div>

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
