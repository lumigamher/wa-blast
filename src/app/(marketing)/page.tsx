import { Check } from "lucide-react";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import { getPlanCatalog } from "@/lib/billing/config";
import { MODULE_LABELS } from "@/lib/billing/plans";
import { db } from "@/lib/db/client";
import { FAQ } from "./_components/faq";
import { Nav } from "./_components/nav";
import { Reveal } from "./_components/reveal";
import { Shot } from "./_components/shot";
import { UsecaseTabs } from "./_components/usecase-tabs";
import { HeroCTA } from "./_components/hero-cta";
import { PricingCTA } from "./_components/pricing-cta";
import { FinalCTA } from "./_components/final-cta";

export const revalidate = 3600;

export default async function MarketingPage() {
  const plans = await getPlanCatalog(db);

  return (
    <>
      <Nav />

      <main className="w-full bg-white">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 md:py-28 border-b border-neutral-200">
          {/* LULA backdrop - interactivo (sigue el cursor), detrás del contenido.
              Recibe el mouse en toda el área del hero; el contenido va con
              pointer-events-none y solo los CTAs reactivan los clicks. */}
          <div
            className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
            aria-hidden="true"
          >
            <div className="absolute inset-0 h-full w-full opacity-70">
              <TextHoverEffect text="LULA" />
            </div>
          </div>

          {/* Velo de legibilidad: difumina/aclara el LULA justo detrás del texto,
              nítido en los bordes. backdrop-blur con máscara radial central. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[5] backdrop-blur-[2px]"
            style={{
              maskImage:
                "radial-gradient(ellipse 60% 55% at 50% 50%, black 35%, transparent 78%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 60% 55% at 50% 50%, black 35%, transparent 78%)",
              background:
                "radial-gradient(ellipse 55% 50% at 50% 50%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.45) 50%, transparent 80%)",
            }}
          />

          <div className="pointer-events-none mx-auto max-w-6xl px-6 md:px-10 relative z-10">
            <Reveal>
              <div className="space-y-8 max-w-3xl mx-auto text-center">
                {/* Eyebrow */}
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Plataforma de WhatsApp para negocios
                </div>

                {/* H1 */}
                <h1 className="text-5xl md:text-7xl tracking-tight font-medium leading-tight">
                  Tu WhatsApp, convertido en{" "}
                  <span
                    className="italic text-neutral-950"
                    style={{ fontFamily: "var(--font-instrument-serif)" }}
                  >
                    ventas
                  </span>
                </h1>

                {/* Subtitle */}
                <p className="text-lg text-neutral-600 leading-relaxed max-w-2xl mx-auto">
                  Campañas masivas, bandeja de entrada en tiempo real y
                  formularios generados con IA, todo sobre la API oficial de
                  Meta.
                </p>

                {/* CTAs — reactivan los clics sobre el backdrop interactivo */}
                <HeroCTA />

                {/* Caption */}
                <p className="text-xs text-neutral-500">
                  Sobre la API oficial de WhatsApp Cloud · Sin permanencia ·
                  Cancela cuando quieras
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Trust Chips */}
        <section className="border-b border-neutral-200 bg-neutral-50 py-8">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-8">
              {[
                "API oficial de Meta",
                "Hecho en Colombia",
                "Multi-equipo",
                "Opt-out automático",
                "Métricas en vivo",
              ].map((chip, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-neutral-700"
                >
                  <Check className="h-4 w-4 text-neutral-600" />
                  <span>{chip}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use-case Tabs */}
        <section className="py-20 md:py-28 border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-neutral-950">
                  Funciones que venden
                </h2>
                <p className="text-lg text-neutral-600 max-w-2xl">
                  Campañas, inbox, formularios con IA, plantillas—todo en un
                  lugar.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <UsecaseTabs />
            </Reveal>
          </div>
        </section>

        {/* Deep Dive: Campañas */}
        <section className="py-20 md:py-28 border-b border-neutral-200">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <Reveal>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Campañas que venden
                    </h3>
                    <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-neutral-950">
                      Masivo. Segmentado. Inteligente.
                    </h2>
                    <p className="text-lg text-neutral-600 max-w-2xl">
                      Envía campañas a miles de contactos con carrusel, botones
                      y formularios. Respeta ventanas de 24h. Reintentos
                      automáticos. Anti-doble envío.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {[
                      "Plantillas con vista previa antes de enviar",
                      "Segmentación por tags y propiedades personalizadas",
                      "Carrusel de productos o promociones",
                      "Botones interactivos y formularios",
                    ].map((bullet, idx) => (
                      <Reveal key={idx} delay={idx * 0.1}>
                        <div className="flex items-start gap-3 text-neutral-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                          {bullet}
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="lg:scale-105">
                  <Shot
                    src="/shots/campanas.png"
                    alt="Tabla de campañas con estadísticas"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Deep Dive: Inbox + IA */}
        <section className="py-20 md:py-28 border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <Reveal delay={0.1}>
                <div className="lg:scale-105 lg:order-2">
                  <Shot
                    src="/shots/inbox-hilo.png"
                    alt="Conversación WhatsApp con cliente en tiempo real"
                  />
                </div>
              </Reveal>

              <Reveal>
                <div className="space-y-8 lg:order-1">
                  <div className="space-y-3">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Inbox + IA
                    </h3>
                    <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-neutral-950">
                      Responde en tiempo real
                    </h2>
                    <p className="text-lg text-neutral-600 max-w-2xl">
                      Bandeja unificada para todos los mensajes. Respuesta
                      rápida. Formularios generados con IA que se adaptan a tus
                      necesidades.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {[
                      "Inbox en tiempo real con notificaciones",
                      "Ventana 24h automática—no envíes fuera de horario",
                      "Describe qué datos necesitas, IA genera el formulario",
                      "Exporta contactos a CSV, integra con tu CRM",
                    ].map((bullet, idx) => (
                      <Reveal key={idx} delay={idx * 0.1}>
                        <div className="flex items-start gap-3 text-neutral-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                          {bullet}
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* AI Prompt → Form */}
        <section className="py-20 md:py-28 border-b border-neutral-200">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="rounded-2xl bg-neutral-950 text-white p-8 md:p-12">
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Left: Prompt */}
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                      Tú describes
                    </p>
                    <div className="font-mono text-sm space-y-2">
                      <p className="text-neutral-300">
                        &quot;Necesito capturar nombre, dirección, <br />
                        teléfono y método de pago para <br />
                        confirmar la entrega&quot;
                      </p>
                    </div>
                  </div>

                  {/* Right: Generated form JSON-ish */}
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                      Lula genera
                    </p>
                    <div className="font-mono text-sm space-y-1.5 text-neutral-400">
                      <p>
                        <span className="text-neutral-300">fields: [</span>
                      </p>
                      <p className="ml-4">
                        <span className="text-blue-400">&#123; name:</span>
                        <span className="text-green-400">
                          &quot;nombre&quot;
                        </span>
                        <span className="text-blue-400"> &#125;</span>
                      </p>
                      <p className="ml-4">
                        <span className="text-blue-400">&#123; address:</span>
                        <span className="text-green-400">
                          &quot;dirección&quot;
                        </span>
                        <span className="text-blue-400"> &#125;</span>
                      </p>
                      <p className="ml-4">
                        <span className="text-blue-400">&#123; phone:</span>
                        <span className="text-green-400">
                          &quot;teléfono&quot;
                        </span>
                        <span className="text-blue-400"> &#125;</span>
                      </p>
                      <p className="ml-4">
                        <span className="text-blue-400">&#123; payment:</span>
                        <span className="text-green-400">&quot;pago&quot;</span>
                        <span className="text-blue-400"> &#125;</span>
                      </p>
                      <p>
                        <span className="text-neutral-300">]</span>
                        <span className="ml-2 inline-block w-2 h-4 bg-white/20 animate-pulse" />
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Full-width Panel Screenshot */}
        <section className="py-20 md:py-28 border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                    Visión completa
                  </p>
                  <h3 className="text-3xl md:text-4xl font-medium tracking-tight text-neutral-950">
                    El panel de Lula
                  </h3>
                  <p className="text-base text-neutral-600">
                    Campañas, métricas y equipo en un solo lugar
                  </p>
                </div>
                <Shot
                  src="/shots/panel.png"
                  alt="Panel principal de Lula con dashboard y campañas"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing Section */}
        <section
          id="precio"
          className="py-20 md:py-28 border-b border-neutral-200 bg-neutral-50"
        >
          <div className="mx-auto max-w-6xl px-6 md:px-10 flex flex-col items-center">
            <Reveal>
              <div className="mb-16 text-center space-y-4 max-w-2xl">
                <h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Planes
                </h3>
                <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-neutral-950">
                  Elige tu plan
                </h2>
                <p className="text-lg text-neutral-600">
                  Sin sorpresas. Sin permanencia. Cancela cuando quieras.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="w-full grid md:grid-cols-3 gap-6">
                {plans.map((plan) => {
                  const isRecommended = plan.id === "pro";
                  const formattedPrice = new Intl.NumberFormat("es-CO").format(
                    plan.priceCop,
                  );
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl p-8 md:p-10 space-y-8 transition-all ${
                        isRecommended
                          ? "border-2 border-emerald-500 bg-white ring-1 ring-emerald-500/20"
                          : "border border-neutral-200 bg-white"
                      }`}
                    >
                      {isRecommended && (
                        <div className="flex justify-center">
                          <div className="inline-block bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-medium uppercase tracking-[0.1em]">
                            Recomendado
                          </div>
                        </div>
                      )}

                      <div className="space-y-3 text-center">
                        <h3 className="text-2xl font-medium text-neutral-950">
                          {plan.name}
                        </h3>
                        <p className="text-sm text-neutral-600">
                          {plan.tagline}
                        </p>
                      </div>

                      <div className="space-y-1 text-center border-t border-b border-neutral-200 py-6">
                        <div className="text-4xl font-medium text-neutral-950">
                          ${formattedPrice}
                        </div>
                        <p className="text-sm text-neutral-600">
                          COP / mes <span className="text-xs">(+ IVA)</span>
                        </p>
                      </div>

                      <div className="space-y-3">
                        {plan.modules.map((moduleId) => (
                          <div
                            key={moduleId}
                            className="flex items-start gap-3 text-sm text-neutral-700"
                          >
                            <Check className="h-5 w-5 text-neutral-600 shrink-0 mt-0.5" />
                            <span>{MODULE_LABELS[moduleId]}</span>
                          </div>
                        ))}
                      </div>

                      <PricingCTA />
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ Section */}
        <section
          id="faq"
          className="py-20 md:py-28 border-b border-neutral-200"
        >
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="mb-16 space-y-4">
                <h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Dudas comunes
                </h3>
                <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-neutral-950">
                  Preguntas frecuentes
                </h2>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <FAQ />
            </Reveal>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-20 md:py-28 border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 md:px-10 text-center">
            <Reveal>
              <div className="space-y-8 max-w-3xl mx-auto">
                <div className="space-y-4">
                  <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-neutral-950">
                    Empieza hoy
                  </h2>
                  <p className="text-lg text-neutral-600">
                    Tu primer envío en minutos. Sin código. Sin permanencia.
                  </p>
                </div>

                <FinalCTA />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-neutral-200 bg-white py-12">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div className="space-y-2">
                <span className="text-sm font-medium text-neutral-950">
                  Lula
                </span>
                <p className="text-xs text-neutral-500">
                  WhatsApp para vender más, desde Colombia.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-neutral-950">
                  Producto
                </h4>
                <ul className="space-y-2 text-xs text-neutral-500">
                  <li>
                    <a
                      href="#funciones"
                      className="hover:text-neutral-950 transition-colors"
                    >
                      Funciones
                    </a>
                  </li>
                  <li>
                    <a
                      href="#precio"
                      className="hover:text-neutral-950 transition-colors"
                    >
                      Precio
                    </a>
                  </li>
                  <li>
                    <a
                      href="#faq"
                      className="hover:text-neutral-950 transition-colors"
                    >
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-neutral-950">Legal</h4>
                <ul className="space-y-2 text-xs text-neutral-500">
                  <li>
                    <a
                      href="#"
                      className="hover:text-neutral-950 transition-colors"
                    >
                      Privacidad
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="hover:text-neutral-950 transition-colors"
                    >
                      Términos
                    </a>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-neutral-950">
                  Contacto
                </h4>
                <ul className="space-y-2 text-xs text-neutral-500">
                  <li>
                    <a
                      href="https://wa.me/573012463004"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-neutral-950 transition-colors"
                    >
                      WhatsApp
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-neutral-500">
                © 2026 Lula. Todos los derechos reservados.
              </p>
              <p className="text-xs text-neutral-500">luladev.com</p>
            </div>
          </div>
        </footer>
      </main>

      {/* JSON-LD SoftwareApplication */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Lula",
            description:
              "Plataforma de campañas masivas, inbox y formularios para WhatsApp sobre la API oficial de Meta.",
            url: "https://luladev.com",
            applicationCategory: "BusinessApplication",
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "COP",
              lowPrice: String(plans[0].priceCop),
              highPrice: String(plans[plans.length - 1].priceCop),
              offerCount: plans.length,
              offers: plans.map((plan) => ({
                "@type": "Offer",
                name: plan.name,
                price: String(plan.priceCop),
                priceCurrency: "COP",
                pricingPattern: "https://schema.org/RecurringPricing",
              })),
            },
            operatingSystem: "Web",
            inLanguage: "es-CO",
          }),
        }}
      />
    </>
  );
}
