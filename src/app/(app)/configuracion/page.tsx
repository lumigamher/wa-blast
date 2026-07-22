import Link from "next/link";
import { count, eq } from "drizzle-orm";
import {
  BotIcon,
  ChevronRightIcon,
  CreditCardIcon,
  HeartPulseIcon,
  KeyIcon,
  MessageSquareIcon,
  PhoneIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/session";
import { getOrgAccess } from "@/lib/billing/access";
import { getSubscription } from "@/lib/billing/subscription";
import { getPlan } from "@/lib/billing/plans";
import { db } from "@/lib/db/client";
import { member } from "@/lib/db/schema";
import { getAgentConfig } from "@/lib/agent/config";
import { getGatewayConfig } from "@/lib/ai/gateway/config";
import { listQuickReplies } from "@/lib/inbox/quick-replies";
import { credsFromSettings } from "@/lib/meta/graph";
import { getOrgSettings } from "@/lib/org/settings";

export const dynamic = "force-dynamic";

type Status = { label: string; tone: "ok" | "pending" | "neutral" } | null;

export default async function ConfigIndex() {
  const { orgId } = await requireOrg();
  const access = await getOrgAccess(db, orgId);

  // Estado real de cada área (tolerante a fallos: nunca tumba la página).
  let metaConnected = false;
  try {
    metaConnected = !!credsFromSettings(await getOrgSettings(db, orgId));
  } catch {
    metaConnected = false;
  }
  const [agentConfig, gateway, quickReplies, memberRows, sub] = await Promise.all([
    access.modules.has("agente") ? getAgentConfig(db, orgId) : Promise.resolve({ enabled: false }),
    getGatewayConfig(db, orgId),
    listQuickReplies(db, orgId).catch(() => []),
    db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)),
    getSubscription(db, orgId).catch(() => null),
  ]);
  const gatewayConnected = !!(
    gateway?.openaiKey || gateway?.anthropicKey || gateway?.googleKey || gateway?.customKey
  );
  const memberCount = Number(memberRows[0]?.n ?? 1);
  const planName = sub ? getPlan(sub.planId).name : null;

  const sections: {
    title: string;
    items: {
      href: string;
      icon: React.ReactNode;
      title: string;
      desc: string;
      status: Status;
      show: boolean;
    }[];
  }[] = [
    {
      title: "Conexión con WhatsApp",
      items: [
        {
          href: "/configuracion/meta",
          icon: <KeyIcon className="size-4 text-blue-600" />,
          title: "Meta WhatsApp",
          desc: "Credenciales, webhook y token de verificación",
          status: metaConnected
            ? { label: "Conectado", tone: "ok" }
            : { label: "Pendiente", tone: "pending" },
          show: true,
        },
        {
          href: "/salud",
          icon: <HeartPulseIcon className="size-4 text-rose-600" />,
          title: "Salud de WhatsApp",
          desc: "Calidad del número, límites de envío y estado de la cuenta",
          status: null,
          show: true,
        },
        {
          href: "/configuracion/llamadas",
          icon: <PhoneIcon className="size-4 text-purple-600" />,
          title: "Llamadas por WhatsApp",
          desc: "Habilita las llamadas de voz en tu número",
          status: metaConnected ? null : { label: "Requiere Meta", tone: "pending" },
          show: access.modules.has("llamadas"),
        },
      ],
    },
    {
      title: "Asistente IA",
      items: [
        {
          href: "/configuracion/agente",
          icon: <BotIcon className="size-4 text-primary" />,
          title: "Agente IA",
          desc: "Comportamiento, herramientas y personalidad del asistente",
          status: agentConfig.enabled
            ? { label: "Activo", tone: "ok" }
            : { label: "Inactivo", tone: "neutral" },
          show: access.modules.has("agente"),
        },
        {
          href: "/configuracion/ia",
          icon: <SparklesIcon className="size-4 text-amber-600" />,
          title: "IA / Modelos",
          desc: "Conecta tu proveedor de IA y elige el modelo",
          status: gatewayConnected
            ? { label: "Conectado", tone: "ok" }
            : { label: "Pendiente", tone: "pending" },
          show: true,
        },
        {
          href: "/configuracion/respuestas",
          icon: <MessageSquareIcon className="size-4 text-emerald-600" />,
          title: "Respuestas rápidas",
          desc: "Atajos para responder más rápido en el inbox",
          status:
            quickReplies.length > 0
              ? {
                  label: `${quickReplies.length} atajo${quickReplies.length === 1 ? "" : "s"}`,
                  tone: "neutral",
                }
              : null,
          show: access.modules.has("inbox"),
        },
      ],
    },
    {
      title: "Tu cuenta",
      items: [
        {
          href: "/configuracion/equipo",
          icon: <UsersIcon className="size-4 text-emerald-600" />,
          title: "Equipo",
          desc: "Invita a tu equipo y gestiona los miembros",
          status: {
            label: `${memberCount} ${memberCount === 1 ? "miembro" : "miembros"}`,
            tone: "neutral",
          },
          show: true,
        },
        {
          href: "/facturacion",
          icon: <CreditCardIcon className="size-4 text-indigo-600" />,
          title: "Facturación",
          desc: "Tu plan, pagos y suscripción",
          status: planName ? { label: `Plan ${planName}`, tone: "neutral" } : null,
          show: true,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Conecta tu WhatsApp, tu asistente y gestiona tu cuenta.
        </p>
      </header>

      {sections.map((section) => {
        const items = section.items.filter((i) => i.show);
        if (items.length === 0) return null;
        return (
          <section key={section.title} className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h2>
            <Card className="py-0">
              <CardContent className="p-0">
                <ul className="divide-y">
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                          {item.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{item.title}</div>
                          <div className="text-xs text-muted-foreground">{item.desc}</div>
                        </div>
                        {item.status && <StatusBadge status={item.status} />}
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: NonNullable<Status> }) {
  const tone =
    status.tone === "ok"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      : status.tone === "pending"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status.label}
    </span>
  );
}
