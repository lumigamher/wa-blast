import {
  FileTextIcon,
  HeartPulseIcon,
  HomeIcon,
  LogOutIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  TagIcon,
  UsersIcon,
  LayersIcon,
  WorkflowIcon,
  CreditCardIcon,
  MessageSquareIcon,
  PhoneIcon,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { logoutAction } from "@/lib/auth/actions";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavGroup, NavLink, NavSection } from "./_components/nav-link";

type NavItem = { href: string; icon: typeof HomeIcon; label: string };
type NavSection = { label: string; items: NavItem[] };

const STANDALONE_ITEMS: NavItem[] = [
  { href: "/panel", icon: HomeIcon, label: "Inicio" },
  { href: "/inbox", icon: MessageSquareIcon, label: "Inbox" },
  { href: "/llamadas", icon: PhoneIcon, label: "Llamadas" },
];

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Mensajería masiva",
    items: [
      { href: "/campanas/nueva", icon: SendIcon, label: "Nuevo envío" },
      { href: "/campanas", icon: LayersIcon, label: "Campañas" },
      { href: "/plantillas", icon: FileTextIcon, label: "Plantillas" },
      { href: "/flows", icon: WorkflowIcon, label: "Flows" },
    ],
  },
  {
    label: "Contactos",
    items: [
      { href: "/contactos", icon: UsersIcon, label: "Contactos" },
      { href: "/contactos/tags", icon: TagIcon, label: "Tags" },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { href: "/salud", icon: HeartPulseIcon, label: "Salud WhatsApp" },
      { href: "/facturacion", icon: CreditCardIcon, label: "Facturación" },
      { href: "/configuracion", icon: SettingsIcon, label: "Configuración" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const initial = (session.user.name ?? session.user.email).trim().charAt(0).toUpperCase();

  // Añade "Admin" a la sección Cuenta solo si el usuario es admin (sin duplicar).
  const isAdmin = isAdminEmail(session.user.email);
  const navSections = NAV_SECTIONS.map((s) =>
    s.label === "Cuenta" && isAdmin
      ? { ...s, items: [...s.items, { href: "/admin", icon: ShieldIcon, label: "Admin" }] }
      : s,
  );

  // Collect all hrefs for NavGroup context
  const standaloneHrefs = STANDALONE_ITEMS.map((n) => n.href);
  const sectionHrefs = navSections.flatMap((s) => s.items.map((n) => n.href));
  const hrefs = [...standaloneHrefs, ...sectionHrefs];

  return (
    <div className="flex h-dvh bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold shadow-sm">
            L
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Lula</div>
            <div className="text-[11px] text-muted-foreground">Envíos masivos</div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 p-3">
          <NavGroup hrefs={hrefs}>
            {/* Standalone items */}
            {STANDALONE_ITEMS.map((item) => {
              const Icon = item.icon;
              return <NavLink key={item.href} href={item.href} icon={<Icon className="size-4" />} label={item.label} />;
            })}

            {/* Grouped sections */}
            {navSections.map((section) => (
              <NavSection key={section.label} label={section.label}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.href} href={item.href} icon={<Icon className="size-4" />} label={item.label} />;
                })}
              </NavSection>
            ))}
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
            <ThemeToggle />
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

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-8 md:px-10 md:py-10 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            {children}
          </div>
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
