"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, UsersIcon } from "lucide-react";
import { authClient, useSession } from "@/lib/auth/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AceptarInvitacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, isPending: loadingSession } = useSession();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function accept() {
    startTransition(async () => {
      const { data, error } = await authClient.organization.acceptInvitation({ invitationId: id });
      if (error) {
        setError(error.message ?? "No pude aceptar la invitación (¿expiró o es de otro correo?)");
        return;
      }
      // Activa la org recién aceptada para que el panel cargue sus datos.
      if (data?.invitation.organizationId) {
        await authClient.organization.setActive({ organizationId: data.invitation.organizationId });
      }
      router.push("/panel");
    });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UsersIcon className="size-5" /> Invitación a un equipo
          </CardTitle>
          <CardDescription>
            Te invitaron a colaborar en una organización de Lula.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSession ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : session ? (
            <>
              <p className="text-sm">
                Sesión iniciada como <b>{session.user.email}</b>. La invitación debe ser para este
                mismo correo.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button onClick={accept} disabled={pending} className="w-full">
                <CheckIcon className="size-4" />
                {pending ? "Uniéndote…" : "Aceptar invitación"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Necesitas una cuenta con el correo invitado. Inicia sesión o regístrate y vuelve a
                abrir el enlace del correo.
              </p>
              <div className="flex gap-2">
                <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Iniciar sesión
                </Link>
                <Link href="/signup" className={buttonVariants({ size: "sm" })}>
                  Crear cuenta
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
