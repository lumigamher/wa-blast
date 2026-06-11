"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import Image from "next/image";
import {
  Send,
  MessageSquare,
  FileText,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface TabContent {
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
}

const tabs: Record<string, TabContent> = {
  campaigns: {
    icon: <Send className="w-5 h-5" />,
    title: "Campañas masivas",
    description:
      "Envía plantillas con carrusel, botones y formularios a cientos o miles de contactos al instante.",
    bullets: [
      "Plantillas con vista previa",
      "Segmentación por tags",
      "Reintentos automáticos",
      "Anti-doble envío",
    ],
    cta: "Conocer campaña masiva",
  },
  inbox: {
    icon: <MessageSquare className="w-5 h-5" />,
    title: "Inbox en tiempo real",
    description:
      "Recibe y responde mensajes de tus clientes en un solo lugar. Ventana 24h respetada.",
    bullets: [
      "Bandeja unificada",
      "Respuestas instantáneas",
      "Historial completo",
      "Asignación de agentes",
    ],
    cta: "Explorar inbox",
  },
  forms: {
    icon: <FileText className="w-5 h-5" />,
    title: "Formularios con IA",
    description:
      "Describe qué datos necesitas y la IA crea el formulario automáticamente.",
    bullets: [
      "Generación con IA",
      "Lógica condicional",
      "Validación de datos",
      "Exporta a CSV",
    ],
    cta: "Ver formularios IA",
  },
  templates: {
    icon: <Sparkles className="w-5 h-5" />,
    title: "Plantillas inteligentes",
    description:
      "Diseña once y reutiliza. Personalización dinámica con datos de tus contactos.",
    bullets: [
      "Editor visual",
      "Personalización {variable}",
      "Librería lista para usar",
      "Aprobación Meta automática",
    ],
    cta: "Diseñar plantilla",
  },
};

const tabKeys = ["campaigns", "inbox", "forms", "templates"] as const;

export function UsecaseTabs() {
  const [activeTab, setActiveTab] = useState<typeof tabKeys[number]>(
    "campaigns"
  );
  const prefersReducedMotion = useReducedMotion();

  const content = tabs[activeTab];

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 md:gap-3">
        {tabKeys.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab
                ? "bg-neutral-950 text-white"
                : "bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-300"
            }`}
          >
            {tabs[tab].title.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: prefersReducedMotion ? 1 : 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 md:p-10"
        >
          <div className="grid lg:grid-cols-5 gap-10 items-start">
            {/* Left: Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-200 text-neutral-950">
                    {content.icon}
                  </div>
                  <h3 className="text-2xl font-medium text-neutral-950">
                    {content.title}
                  </h3>
                </div>
              </div>

              <p className="text-neutral-600 leading-relaxed">
                {content.description}
              </p>

              <ul className="space-y-3">
                {content.bullets.map((bullet, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-sm text-neutral-700"
                  >
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                    {bullet}
                  </li>
                ))}
              </ul>

              <a
                href="#"
                className="inline-flex items-center gap-2 text-sm font-medium text-neutral-950 hover:gap-3 transition-all"
              >
                {content.cta}
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            {/* Right: Real screenshots or vignette - larger, more prominent */}
            <div className="lg:col-span-3 lg:scale-110 lg:origin-top-left">
              {activeTab === "campaigns" && (
                <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-200 shadow-[0_8px_40px_rgb(0,0,0,0.08)]">
                  <div className="bg-neutral-100 border-b border-neutral-200 px-3 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="bg-white rounded-full px-2 py-0.5 text-xs text-neutral-600 border border-neutral-200">
                        app.luladev.com
                      </div>
                    </div>
                  </div>
                  <Image
                    src="/shots/campanas.png"
                    alt="Tabla de campañas"
                    width={1440}
                    height={900}
                    quality={90}
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="w-full h-auto block"
                  />
                </div>
              )}
              {activeTab === "inbox" && (
                <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-200 shadow-[0_8px_40px_rgb(0,0,0,0.08)]">
                  <div className="bg-neutral-100 border-b border-neutral-200 px-3 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="bg-white rounded-full px-2 py-0.5 text-xs text-neutral-600 border border-neutral-200">
                        app.luladev.com
                      </div>
                    </div>
                  </div>
                  <Image
                    src="/shots/inbox-hilo.png"
                    alt="Conversación WhatsApp en inbox"
                    width={1440}
                    height={900}
                    quality={90}
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="w-full h-auto block"
                  />
                </div>
              )}
              {activeTab === "forms" && (
                <div className="rounded-lg bg-white border border-neutral-200 p-4 space-y-3">
                  <div className="space-y-2">
                    <div className="h-2 bg-neutral-200 rounded-full w-1/3" />
                    <div className="space-y-1.5">
                      <div className="h-6 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-6 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-6 bg-neutral-100 rounded border border-neutral-200" />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "templates" && (
                <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-200 shadow-[0_8px_40px_rgb(0,0,0,0.08)]">
                  <div className="bg-neutral-100 border-b border-neutral-200 px-3 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="bg-white rounded-full px-2 py-0.5 text-xs text-neutral-600 border border-neutral-200">
                        app.luladev.com
                      </div>
                    </div>
                  </div>
                  <Image
                    src="/shots/panel.png"
                    alt="Panel de Lula con plantillas"
                    width={1440}
                    height={900}
                    quality={90}
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="w-full h-auto block"
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
