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
import { NavGroup, NavLink } from "./_components/nav-link";

const NAV_ITEMS = [
  { href: "/", icon: HomeIcon, label: "Inicio" },
  { href: "/campanas/nueva", icon: SendIcon, label: "Nuevo envío" },
  { href: "/campanas", icon: LayersIcon, label: "Campañas" },
  { href: "/contactos", icon: UsersIcon, label: "Contactos" },
  { href: "/contactos/tags", icon: TagIcon, label: "Tags" },
  { href: "/plantillas", icon: FileTextIcon, label: "Plantillas" },
  { href: "/salud", icon: HeartPulseIcon, label: "Salud WhatsApp" },
  { href: "/configuracion", icon: SettingsIcon, label: "Configuración" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const initial = (session.user.name ?? session.user.email).trim().charAt(0).toUpperCase();
  const hrefs = NAV_ITEMS.map((n) => n.href);

  return (
    <div className="flex h-dvh bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold shadow-sm">
            M
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Milujo Blast</div>
            <div className="text-[11px] text-muted-foreground">Envíos masivos</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          <NavGroup hrefs={hrefs}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return <NavLink key={item.href} href={item.href} icon={<Icon className="size-4" />} label={item.label} />;
            })}
          </NavGroup>
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
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="Salir"
              >
                <LogOutIcon className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
          {children}
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
