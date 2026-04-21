import Link from "next/link";
import { redirect } from "next/navigation";
import {
  HomeIcon,
  SendIcon,
  HistoryIcon,
  FileTextIcon,
  HeartPulseIcon,
  LogOutIcon,
} from "lucide-react";
import { logoutAction } from "../login/actions";
import { requireAdmin } from "@/lib/session";
import { Toaster } from "@/components/ui/sonner";
import { NavLink } from "./_components/nav-link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  if (!user) redirect("/login");

  const initial = user.name.trim().charAt(0).toUpperCase() || "F";

  return (
    <div className="flex h-dvh bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            F
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">
              FUNES IPS
            </div>
            <div className="text-[11px] text-muted-foreground">
              Envíos masivos
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          <NavLink href="/" icon={<HomeIcon className="size-4" />} label="Inicio" />
          <NavLink
            href="/nuevo-envio"
            icon={<SendIcon className="size-4" />}
            label="Nuevo envío"
          />
          <NavLink
            href="/historial"
            icon={<HistoryIcon className="size-4" />}
            label="Historial"
          />
          <NavLink
            href="/plantillas"
            icon={<FileTextIcon className="size-4" />}
            label="Plantillas"
          />
          <NavLink
            href="/salud"
            icon={<HeartPulseIcon className="size-4" />}
            label="Salud WhatsApp"
          />
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {user.email}
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Salir"
              >
                <LogOutIcon className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
          {children}
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
