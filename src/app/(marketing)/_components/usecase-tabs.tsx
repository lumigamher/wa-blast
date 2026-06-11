"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
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
          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Left: Info */}
            <div className="md:col-span-2 space-y-6">
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

            {/* Right: Mini UI vignette */}
            <div className="md:col-span-1">
              <div className="rounded-lg bg-white border border-neutral-200 p-4 space-y-3">
                {activeTab === "campaigns" && (
                  <div className="space-y-2">
                    <div className="h-2 bg-neutral-200 rounded-full w-1/3" />
                    <div className="space-y-1">
                      <div className="h-3 bg-neutral-100 rounded-full w-full" />
                      <div className="h-3 bg-neutral-100 rounded-full w-5/6" />
                      <div className="h-3 bg-neutral-100 rounded-full w-4/5" />
                    </div>
                    <div className="pt-2 flex gap-1">
                      <div className="h-6 bg-neutral-950 rounded text-white text-xs flex items-center justify-center w-1/3 text-center">
                        Enviar
                      </div>
                      <div className="h-6 bg-neutral-100 rounded flex-1" />
                    </div>
                  </div>
                )}
                {activeTab === "inbox" && (
                  <div className="space-y-2">
                    <div className="flex gap-2 pb-2 border-b border-neutral-200">
                      <div className="h-8 w-8 bg-neutral-300 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 bg-neutral-200 rounded-full w-1/2" />
                        <div className="h-2 bg-neutral-100 rounded-full w-2/3" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-1.5 bg-neutral-200 rounded-full w-full" />
                      <div className="h-1.5 bg-neutral-100 rounded-full w-4/5" />
                    </div>
                  </div>
                )}
                {activeTab === "forms" && (
                  <div className="space-y-2">
                    <div className="h-2 bg-neutral-200 rounded-full w-1/3" />
                    <div className="space-y-1.5">
                      <div className="h-6 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-6 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-6 bg-neutral-100 rounded border border-neutral-200" />
                    </div>
                  </div>
                )}
                {activeTab === "templates" && (
                  <div className="space-y-2">
                    <div className="h-2 bg-neutral-200 rounded-full w-1/3" />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="h-8 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-8 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-8 bg-neutral-100 rounded border border-neutral-200" />
                      <div className="h-8 bg-neutral-100 rounded border border-neutral-200" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
