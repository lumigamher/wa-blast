import Link from "next/link";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-dvh flex">
      <aside className="w-56 border-r bg-muted/30 p-4 space-y-2">
        <div className="font-bold text-lg">wa-blast</div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/" className="hover:underline">
            Dashboard
          </Link>
          <Link href="/campanas" className="hover:underline">
            Campañas
          </Link>
          <Link href="/contactos" className="hover:underline">
            Contactos
          </Link>
          <Link href="/contactos/segmentos" className="hover:underline">
            Segmentos
          </Link>
          <Link href="/contactos/tags" className="hover:underline">
            Tags
          </Link>
          <Link href="/configuracion" className="hover:underline">
            Configuración
          </Link>
        </nav>
        <div className="pt-6 text-xs text-muted-foreground">{session.user.email}</div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
