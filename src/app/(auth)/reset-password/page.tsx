"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm">Cargando…</p>}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const sp = useSearchParams();
  const token = sp.get("token");
  if (token) return <Reset token={token} />;
  return <Request />;
}

function Request() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forget-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">Revisa tu email</h1>
        <p className="text-sm text-muted-foreground">
          Si esa cuenta existe, te enviamos un link de reset.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm text-primary hover:underline"
        >
          Volver a login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Recuperar contraseña
        </h1>
        <p className="text-sm text-muted-foreground">
          Te enviaremos un link para cambiarla.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enviando…" : "Enviar link"}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-muted-foreground hover:underline flex items-center gap-1 justify-center"
        >
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      </p>
    </form>
  );
}

function Reset({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await authClient.resetPassword({ newPassword: pw, token });
    setLoading(false);
    if (res.error) {
      setErr(res.error.message ?? "No se pudo cambiar la contraseña");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">Listo</h1>
        <p className="text-sm text-muted-foreground">
          Tu contraseña fue actualizada.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm text-primary hover:underline"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Nueva contraseña
        </h1>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw">Contraseña (mín. 8)</Label>
        <Input
          id="pw"
          required
          minLength={8}
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </div>
      {err && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
