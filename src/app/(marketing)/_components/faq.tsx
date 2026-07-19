"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

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
    <div className="space-y-0 max-w-2xl">
      {faqs.map((faq, idx) => (
        <div key={idx} className="border-b border-neutral-200 last:border-b-0">
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            aria-expanded={open === idx}
            className="w-full flex items-center justify-between px-0 py-4 hover:opacity-70 transition-opacity text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            <h3 className="font-medium text-neutral-950 pr-4">{faq.question}</h3>
            <ChevronDown
              aria-hidden="true"
              className={`h-5 w-5 text-neutral-500 shrink-0 transition-transform duration-200 ${
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
                <div className="pb-4">
                  <p className="text-sm text-neutral-600 leading-relaxed">
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
