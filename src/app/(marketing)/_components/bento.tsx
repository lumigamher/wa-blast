import {
  SendIcon,
  MessageSquareIcon,
  FileTextIcon,
  UsersIcon,
  BarChart3Icon,
} from "lucide-react";
import { Reveal } from "./reveal";

const features = [
  {
    title: "Campañas masivas",
    description: "Envía templatas con carrusel, botones y formularios a miles de contactos al instante.",
    icon: SendIcon,
    span: "md:col-span-2",
  },
  {
    title: "Inbox en tiempo real",
    description: "Recibe y responde mensajes de tus clientes en un solo lugar, sin dejar WhatsApp.",
    icon: MessageSquareIcon,
    span: "md:col-span-2",
  },
  {
    title: "Formularios con IA",
    description: "Crea formularios que se adapten a las respuestas de tus clientes automáticamente.",
    icon: FileTextIcon,
    span: "md:col-span-1",
  },
  {
    title: "Plantillas inteligentes",
    description: "Diseña y vista previa tus mensajes antes de enviar.",
    icon: FileTextIcon,
    span: "md:col-span-1",
  },
  {
    title: "Segmentación y tags",
    description: "Organiza tus contactos, crea grupos y personaliza tus campañas.",
    icon: UsersIcon,
    span: "md:col-span-1",
  },
  {
    title: "Métricas en vivo",
    description: "Mide entregas, lecturas, clics y conversiones en tiempo real.",
    icon: BarChart3Icon,
    span: "md:col-span-1",
  },
];

export function Bento() {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {features.map((feature, idx) => {
        const Icon = feature.icon;
        return (
          <Reveal key={feature.title} delay={idx * 0.08}>
            <div
              className={`${feature.span} group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 p-6 hover:-translate-y-1 hover:border-emerald-500/40 transition-all duration-300 cursor-default`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-transparent to-emerald-500/0 opacity-0 group-hover:opacity-10 transition-opacity" />
              <div className="absolute -inset-32 bg-radial-gradient from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-3xl" />

              <div className="relative z-10">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
