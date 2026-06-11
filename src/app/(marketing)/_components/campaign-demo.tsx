"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

const templates: Record<
  string,
  {
    message: string;
    buttons: string[];
  }
> = {
  restaurant: {
    message: "Hola, te tenemos una promo especial 🍽️",
    buttons: ["Pedir ahora", "Ver menú"],
  },
  store: {
    message: "Tenemos un 30% de descuento esta semana 🛍️",
    buttons: ["Ver productos", "Preguntar"],
  },
  services: {
    message: "Reserva hoy y obtén 20% off en tu primer servicio ✨",
    buttons: ["Agendar", "Más info"],
  },
};

export function CampaignDemo() {
  const [businessName, setBusinessName] = useState("");
  const [vertical, setVertical] = useState<"restaurant" | "store" | "services">(
    "restaurant"
  );
  const [showPreview, setShowPreview] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const displayName = businessName.trim() || "Donde Lula";
  const template = templates[vertical];

  const messageText = `${template.message}\n\n¿Hola ${displayName}? 👋`;

  const handleGenerate = () => {
    setShowPreview(true);
    if (!prefersReducedMotion) {
      setTimeout(() => setShowPreview(false), 3000);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 md:p-10 max-w-4xl mx-auto">
      <div className="grid md:grid-cols-2 gap-8 items-stretch">
        {/* Left: Controls */}
        <div className="flex flex-col justify-between space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Nombre de tu negocio
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ej: Mi Restaurante"
              className="w-full px-4 py-3 rounded-lg border border-neutral-200 bg-white text-neutral-950 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2 focus:ring-offset-neutral-50 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Tipo de negocio
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "restaurant", label: "Restaurante" },
                { id: "store", label: "Tienda" },
                { id: "services", label: "Servicios" },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() =>
                    setVertical(option.id as "restaurant" | "store" | "services")
                  }
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    vertical === option.id
                      ? "bg-neutral-950 text-white"
                      : "bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            className="w-full rounded-full bg-neutral-950 text-white py-3 px-6 text-sm font-medium hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
          >
            Generar campaña
          </button>
        </div>

        {/* Right: WhatsApp Preview */}
        <AnimatePresence mode="wait">
          {showPreview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center"
            >
              <div className="w-full max-w-xs rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-lg">
                {/* Phone notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-5 bg-black rounded-b-3xl" />

                {/* Chat area */}
                <div className="bg-[#efeae2] p-4 pt-8 min-h-96 space-y-3 flex flex-col justify-end">
                  {/* Incoming: Bot campaign message */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-xs bg-white rounded-3xl rounded-tl-none px-4 py-3 shadow-sm">
                      <p className="text-sm text-neutral-900 leading-relaxed whitespace-pre-wrap">
                        {messageText}
                      </p>
                      <div className="mt-2 flex gap-1 opacity-70">
                        <Check className="h-4 w-4" />
                        <Check className="h-4 w-4" />
                      </div>
                    </div>
                  </motion.div>

                  {/* Message buttons */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-xs bg-white rounded-3xl rounded-tl-none px-3 py-2 shadow-sm space-y-2">
                      {template.buttons.map((btn, idx) => (
                        <button
                          key={idx}
                          className="block w-full text-left text-sm px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-950 transition-colors font-medium"
                        >
                          {btn}
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Incoming: Confirmation */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-xs bg-white rounded-3xl rounded-tl-none px-4 py-3 shadow-sm">
                      <p className="text-sm text-neutral-900 font-medium">
                        ✓✓ Tu mensaje fue enviado a 500 contactos
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Tasa de lectura: 78%
                      </p>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center rounded-3xl bg-white border border-neutral-200 p-8 text-center"
            >
              <div className="space-y-3">
                <div className="text-neutral-400">
                  <svg
                    className="w-12 h-12 mx-auto"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                  </svg>
                </div>
                <p className="text-sm text-neutral-600">
                  Completa el formulario para ver la vista previa
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
