import {
  FileTextIcon,
  HeartPulseIcon,
  HomeIcon,
  LogOutIcon,
  SendIcon,
  SettingsIcon,
  TagIcon,
  UsersIcon,
  LayersIcon,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { Toaster } from "@/components/ui/sonner";
import { NavLink } from "./_components/nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const initial = (session.user.name ?? session.user.email).trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-dvh bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            W
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">wa-blast</div>
            <div className="text-[11px] text-muted-foreground">Envíos masivos</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          <NavLink href="/" icon={<HomeIcon className="size-4" />} label="Inicio" />
          <NavLink href="/campanas/nueva" icon={<SendIcon className="size-4" />} label="Nuevo envío" />
          <NavLink href="/campanas" icon={<LayersIcon className="size-4" />} label="Campañas" />
          <NavLink href="/contactos" icon={<UsersIcon className="size-4" />} label="Contactos" />
          <NavLink href="/contactos/tags" icon={<TagIcon className="size-4" />} label="Tags" />
          <NavLink href="/plantillas" icon={<FileTextIcon className="size-4" />} label="Plantillas" />
          <NavLink href="/salud" icon={<HeartPulseIcon className="size-4" />} label="Salud WhatsApp" />
          <NavLink href="/configuracion/meta" icon={<SettingsIcon className="size-4" />} label="Configuración" />
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{session.user.name ?? session.user.email}</div>
              <div className="truncate text-[10px] text-muted-foreground">{session.user.email}</div>
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
        <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">{children}</div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
