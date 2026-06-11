"use client";

import { motion, useReducedMotion } from "motion/react";

export function HeroChat() {
  const prefersReducedMotion = useReducedMotion();

  const bubbles = [
    {
      type: "outgoing" as const,
      text: "🎉 Descuento 30% hoy",
      buttons: ["Ver oferta", "No gracias"],
      delay: 0,
    },
    {
      type: "incoming" as const,
      text: "Ver oferta",
      delay: 2,
    },
    {
      type: "form" as const,
      text: "✅ Pedido confirmado",
      subtext: "Tu número de orden: #12345",
      delay: 3.5,
    },
  ];

  if (prefersReducedMotion) {
    return (
      <div className="flex items-center justify-center">
        <div className="relative w-full max-w-xs rounded-[2.5rem] border border-white/10 bg-zinc-900/50 overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-black rounded-b-2xl shadow-md" />
          <div className="p-4 pt-8 space-y-3 h-80">
            {bubbles.map((bubble, idx) => (
              <div
                key={idx}
                className={`flex ${bubble.type === "incoming" ? "justify-start" : "justify-end"}`}
              >
                {bubble.type === "outgoing" && (
                  <div className="max-w-xs bg-emerald-500 text-black rounded-3xl px-4 py-2 space-y-2">
                    <p className="text-sm font-medium">{bubble.text}</p>
                    {bubble.buttons && (
                      <div className="flex gap-2">
                        {bubble.buttons.map((btn, i) => (
                          <button
                            key={i}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-full font-medium transition-colors"
                          >
                            {btn}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {bubble.type === "incoming" && (
                  <div className="max-w-xs bg-zinc-700 text-white rounded-3xl px-4 py-2">
                    <p className="text-sm">{bubble.text}</p>
                  </div>
                )}
                {bubble.type === "form" && (
                  <div className="max-w-xs bg-emerald-500 text-black rounded-3xl px-4 py-3 space-y-1">
                    <p className="text-sm font-bold">{bubble.text}</p>
                    <p className="text-xs text-emerald-900">{bubble.subtext}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <div className="relative w-full max-w-xs rounded-[2.5rem] border border-white/10 bg-zinc-900/50 overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-black rounded-b-2xl shadow-md" />
        <div className="p-4 pt-8 space-y-3 h-80">
          {bubbles.map((bubble) => (
            <motion.div
              key={`${bubble.type}-${bubble.delay}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: bubble.delay,
                duration: 0.5,
                repeat: Infinity,
                repeatDelay: 5,
                repeatType: "loop",
              }}
              className={`flex ${bubble.type === "incoming" ? "justify-start" : "justify-end"}`}
            >
              {bubble.type === "outgoing" && (
                <div className="max-w-xs bg-emerald-500 text-black rounded-3xl px-4 py-2 space-y-2">
                  <p className="text-sm font-medium">{bubble.text}</p>
                  {bubble.buttons && (
                    <div className="flex gap-2">
                      {bubble.buttons.map((btn, i) => (
                        <button
                          key={i}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-full font-medium transition-colors"
                        >
                          {btn}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {bubble.type === "incoming" && (
                <div className="max-w-xs bg-zinc-700 text-white rounded-3xl px-4 py-2">
                  <p className="text-sm">{bubble.text}</p>
                </div>
              )}
              {bubble.type === "form" && (
                <div className="max-w-xs bg-emerald-500 text-black rounded-3xl px-4 py-3 space-y-1">
                  <p className="text-sm font-bold">{bubble.text}</p>
                  <p className="text-xs text-emerald-900">{bubble.subtext}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
