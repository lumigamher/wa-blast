"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { TemplateDraft } from "../template-wizard";

export function StepAuth({ draft, update }: { draft: TemplateDraft; update: (p: Partial<TemplateDraft>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Autenticación (OTP)</h2>
      <p className="text-xs text-muted-foreground">
        El cuerpo lo genera Meta automáticamente: «&#123;&#123;1&#125;&#125; es tu código de verificación». Tú solo configuras el botón y la caducidad.
      </p>

      <div>
        <Label htmlFor="otp-btn">Texto del botón (máx 25 caracteres)</Label>
        <Input
          id="otp-btn"
          maxLength={25}
          value={draft.otpButtonText}
          onChange={(e) => update({ otpButtonText: e.target.value })}
          placeholder="Copiar código"
        />
        <p className="mt-1 text-xs text-muted-foreground">Etiqueta del botón que el usuario presiona para copiar el código.</p>
      </div>

      <div>
        <Label htmlFor="otp-exp">Caducidad del código (minutos, 1–90; vacío = sin caducidad)</Label>
        <Input
          id="otp-exp"
          type="number"
          min={1}
          max={90}
          value={draft.codeExpirationMinutes ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            update({ codeExpirationMinutes: v ? Number(v) : null });
          }}
          placeholder="10"
        />
        <p className="mt-1 text-xs text-muted-foreground">Cuántos minutos antes de que expire el código.</p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="security-rec"
          checked={draft.addSecurityRecommendation}
          onCheckedChange={(v) => update({ addSecurityRecommendation: v === true })}
        />
        <Label htmlFor="security-rec" className="text-sm font-normal cursor-pointer">
          Añadir recomendación de seguridad (&quot;no compartas este código&quot;)
        </Label>
      </div>
    </div>
  );
}
