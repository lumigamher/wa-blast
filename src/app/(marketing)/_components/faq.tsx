"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDownIcon } from "lucide-react";

const faqs = [
  {
    question: "¿Mi número de WhatsApp se va a bloquear usando la API oficial?",
    answer:
      "No. La API oficial de WhatsApp Cloud de Meta no bloquea números. Estás usando la infraestructura segura y legitimada de Meta. Los bloqueos ocurren por actividad maliciosa (spam, virus, etc.), no por usar API oficial. De hecho, usar API es más seguro que bots no autorizados.",
  },
  {
    question: "¿Cuánto cobra Meta por cada mensaje?",
    answer:
      "Meta cobra por conversación iniciada por el usuario (mensaje entrante), no por mensaje saliente. El precio varía entre $0.01 y $0.05 USD según el tipo de conversación y la zona geográfica. En Lula, ese costo va directamente a tu factura de Meta—nosotros no sumamos margen adicional.",
  },
  {
    question: "¿Puedo usar mi número actual de WhatsApp o tengo que crear uno nuevo?",
    answer:
      "Usas tu número actual. Migramos tu número a WhatsApp Cloud API sin perder tu historial ni contactos. El proceso es transparente y toma minutos.",
  },
  {
    question: "¿Necesito saber de programación o código para usar Lula?",
    answer:
      "Cero código. Lula está diseñado para vendedores, emprendedores y pymes. Creas campañas, formularios y flujos desde la interfaz—sin tocar una línea de código.",
  },
  {
    question: "¿Hay contrato mínimo o permanencia?",
    answer:
      "No hay permanencia. Pagas $250.000 COP mes a mes, sin contrato. Cancelas cuando quieras sin penalización.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-3 max-w-2xl">
      {faqs.map((faq, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-white/10 bg-zinc-900/40 overflow-hidden"
        >
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            aria-expanded={open === idx}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-900/60 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]"
          >
            <h3 className="font-medium text-white pr-4">{faq.question}</h3>
            <ChevronDownIcon
              className={`h-5 w-5 text-zinc-400 shrink-0 transition-transform ${
                open === idx ? "rotate-180" : ""
              }`}
            />
          </button>

          <AnimatePresence>
            {open === idx && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-6 py-4 border-t border-white/5 bg-zinc-950/50">
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
