import {
  ActivityIcon,
  BotIcon,
  CalendarIcon,
  CreditCardIcon,
  FileTextIcon,
  HeartPulseIcon,
  HomeIcon,
  LayersIcon,
  LogOutIcon,
  MessageSquareIcon,
  PackageIcon,
  PhoneIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
  WorkflowIcon,
  WrenchIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { logoutAction } from "@/lib/auth/actions";
import { isAdminEmail } from "@/lib/auth/admin";
import { requireSession, requireOrg } from "@/lib/auth/session";
import { getOrgAccess } from "@/lib/billing/access";
import { db } from "@/lib/db/client";
import { CallPanel } from "./_components/call-panel";
import { NavGroup, NavLink, NavSection } from "./_components/nav-link";
import { AppContent } from "./_components/app-content";

type NavItem = {
  href: string;
  icon: typeof HomeIcon;
  label: string;
  module?: "agente" | "campanas" | "inbox" | "plantillas" | "contactos" | "flows" | "llamadas";
};
type NavSection = { label: string; items: NavItem[] };

const STANDALONE_ITEMS: NavItem[] = [
  { href: "/panel", icon: HomeIcon, label: "Inicio" },
  { href: "/pedidos", icon: ShoppingBagIcon, label: "Pedidos", module: "agente" },
  { href: "/inbox", icon: MessageSquareIcon, label: "Inbox", module: "inbox" },
  { href: "/llamadas", icon: PhoneIcon, label: "Llamadas", module: "llamadas" },
];

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Mensajería masiva",
    items: [
      { href: "/campanas/nueva", icon: SendIcon, label: "Nuevo envío", module: "campanas" },
      { href: "/campanas", icon: LayersIcon, label: "Campañas", module: "campanas" },
      { href: "/plantillas", icon: FileTextIcon, label: "Plantillas", module: "plantillas" },
      { href: "/flows", icon: WorkflowIcon, label: "Flows", module: "flows" },
    ],
  },
  {
    label: "Contactos",
    items: [
      { href: "/contactos", icon: UsersIcon, label: "Contactos", module: "contactos" },
      { href: "/contactos/tags", icon: TagIcon, label: "Tags", module: "contactos" },
    ],
  },
  {
    label: "Agente IA",
    items: [
      { href: "/configuracion/agente", icon: BotIcon, label: "Configuración", module: "agente" },
      { href: "/configuracion/agente/herramientas", icon: WrenchIcon, label: "Herramientas", module: "agente" },
      { href: "/configuracion/agente/calendario", icon: CalendarIcon, label: "Calendario", module: "agente" },
      { href: "/configuracion/agente/catalogo", icon: PackageIcon, label: "Catálogo", module: "agente" },
      { href: "/configuracion/agente/pagos", icon: CreditCardIcon, label: "Medios de pago", module: "agente" },
      { href: "/configuracion/agente/envios", icon: TruckIcon, label: "Envíos", module: "agente" },
      { href: "/configuracion/agente/documentos", icon: FileTextIcon, label: "Base de conocimiento", module: "agente" },
      { href: "/configuracion/agente/actividad", icon: ActivityIcon, label: "Actividad", module: "agente" },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { href: "/configuracion/ia", icon: SparklesIcon, label: "IA / Modelos" },
      { href: "/salud", icon: HeartPulseIcon, label: "Salud WhatsApp" },
      { href: "/facturacion", icon: CreditCardIcon, label: "Facturación" },
      { href: "/configuracion", icon: SettingsIcon, label: "Configuración" },
    ],
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const { orgId } = await requireOrg();
  const access = await getOrgAccess(db, orgId);

  const initial = (session.user.name ?? session.user.email)
    .trim()
    .charAt(0)
    .toUpperCase();

  // Añade "Admin" a la sección Cuenta solo si el usuario es admin (sin duplicar).
  const isAdmin = isAdminEmail(session.user.email);
  const navSections = NAV_SECTIONS.map((s) =>
    s.label === "Cuenta" && isAdmin
      ? {
          ...s,
          items: [
            ...s.items,
            { href: "/admin", icon: ShieldIcon, label: "Admin" },
          ],
        }
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
            <div className="text-[11px] text-muted-foreground">
              Envíos masivos
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
          <NavGroup hrefs={hrefs}>
            {/* Standalone items */}
            {STANDALONE_ITEMS.map((item) => {
              const Icon = item.icon;
              const isLocked = item.module && !access.modules.has(item.module);
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  icon={<Icon className="size-4" />}
                  label={item.label}
                  locked={isLocked}
                />
              );
            })}

            {/* Grouped sections */}
            {navSections.map((section) => (
              <NavSection key={section.label} label={section.label}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isLocked = item.module && !access.modules.has(item.module);
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      icon={<Icon className="size-4" />}
                      label={item.label}
                      locked={isLocked}
                    />
                  );
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
              <div className="truncate text-xs font-medium">
                {session.user.name ?? session.user.email}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {session.user.email}
              </div>
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
        <AppContent>{children}</AppContent>
      </main>
      <CallPanel />
      <Toaster richColors position="top-right" />
    </div>
  );
}
