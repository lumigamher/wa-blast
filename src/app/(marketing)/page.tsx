import { getSession } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Nav } from "./_components/nav";
import { HeroChat } from "./_components/hero-chat";
import { Reveal } from "./_components/reveal";
import { Bento } from "./_components/bento";
import { FAQ } from "./_components/faq";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";

export default async function MarketingPage() {
  const session = await getSession();
  const loggedIn = !!session;

  return (
    <>
      <Nav loggedIn={loggedIn} />

      <main className="w-full">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-24 md:py-32">
          {/* Background glows */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] -z-10" />
          <div className="absolute bottom-1/3 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] -z-10" />

          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-tight">
                    <span className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">
                      Tu WhatsApp,
                    </span>{" "}
                    <span className="bg-gradient-to-br from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
                      máquina de ventas
                    </span>
                  </h1>
                  <p className="text-lg text-zinc-300 leading-relaxed max-w-lg">
                    Campañas masivas, inbox en tiempo real y formularios con IA.
                    Todo sobre la API oficial de Meta. Sin permanencia, mes a mes.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  {!loggedIn && (
                    <>
                      <Link
                        href="/signup"
                        className={cn(buttonVariants({ size: "lg" }), "bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] transition-shadow")}
                      >
                        Crear cuenta gratis
                      </Link>
                      <a
                        href="https://wa.me/573012463004"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ size: "lg", variant: "outline" }), "border-white/10 text-white hover:bg-white/5 hover:text-white")}
                      >
                        Escríbenos por WhatsApp
                      </a>
                      {/* TODO(luis): confirmar número WhatsApp comercial */}
                    </>
                  )}
                  {loggedIn && (
                    <Link
                      href="/panel"
                      className={cn(buttonVariants({ size: "lg" }), "bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-[0_0_30px_rgba(16,185,129,0.4)]")}
                    >
                      Ir al panel
                    </Link>
                  )}
                </div>
              </div>

              <div className="hidden md:flex justify-center items-center">
                <HeroChat />
              </div>
            </div>

            {/* Mobile hero chat */}
            <div className="md:hidden mt-12">
              <HeroChat />
            </div>
          </div>
        </section>

        {/* Trust Strip */}
        <section className="border-y border-white/5 bg-zinc-900/30 py-8">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>API oficial de Meta</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Hecho en Colombia 🇨🇴</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Sin permanencia, mes a mes</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features - Bento Section */}
        <section id="funciones" className="py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">
                  Funciones diseñadas para vender
                </h2>
                <p className="text-lg text-zinc-400 max-w-2xl">
                  Todo lo que necesitas para convertir WhatsApp en tu canal de
                  ventas más efectivo.
                </p>
              </div>
            </Reveal>

            <div className="mt-12">
              <Bento />
            </div>
          </div>
        </section>

        {/* Cómo funciona Section */}
        <section className="py-24 md:py-32 bg-zinc-950/40">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">
                  Tres pasos para empezar
                </h2>
                <p className="text-lg text-zinc-400">
                  De cero a tu primera campaña en minutos.
                </p>
              </div>
            </Reveal>

            <div className="grid md:grid-cols-3 gap-8 mt-12">
              {[
                {
                  step: 1,
                  title: "Crea tu cuenta",
                  description: "Regístrate con tu email. Toma menos de 2 minutos.",
                },
                {
                  step: 2,
                  title: "Conecta tu WhatsApp",
                  description:
                    "Vincula tu número actual. Te acompañamos en cada paso.",
                },
                {
                  step: 3,
                  title: "Lanza tu campaña",
                  description:
                    "Crea y envía tu primer mensaje a miles de contactos.",
                },
              ].map((item, idx) => (
                <Reveal key={item.step} delay={idx * 0.1}>
                  <div className="relative">
                    <div className="flex flex-col items-start">
                      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40 text-emerald-400 font-bold">
                        {item.step}
                      </div>
                      <h3 className="font-semibold text-white mb-2">
                        {item.title}
                      </h3>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                    {idx < 2 && (
                      <div className="absolute top-6 left-20 hidden md:block w-12 h-0.5 bg-gradient-to-r from-emerald-500/40 to-transparent" />
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="precio" className="py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-6 md:px-10 flex flex-col items-center">
            <Reveal>
              <div className="mb-16 text-center space-y-4">
                <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">
                  Precio simple y justo
                </h2>
                <p className="text-lg text-zinc-400">
                  Un plan, todo incluido. Sin sorpresas.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="max-w-md w-full rounded-2xl border border-emerald-500/40 bg-zinc-900/40 p-8 space-y-8 ring-1 ring-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                <div className="space-y-2">
                  <div className="text-5xl font-bold text-white">
                    $250.000
                  </div>
                  <p className="text-zinc-400">
                    COP / mes{" "}
                    <span className="text-sm">
                      + IVA
                    </span>
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    "Campañas masivas ilimitadas",
                    "Inbox en tiempo real",
                    "Formularios con IA",
                    "Plantillas con preview",
                    "Contactos y tags",
                    "Métricas en vivo",
                    "API oficial de Meta",
                    "Soporte por email",
                  ].map((feature) => (
                    <div
                      key={feature}
                      className="flex items-start gap-3 text-sm text-zinc-300"
                    >
                      <CheckCircle2Icon className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/signup"
                  className={cn(buttonVariants({ size: "lg" }), "w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-[0_0_30px_rgba(16,185,129,0.4)]")}
                >
                  Empezar ahora
                </Link>

                <p className="text-center text-xs text-zinc-500">
                  Sin permanencia. Cancela cuando quieras.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 md:py-32 bg-zinc-950/40">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">
                  Preguntas frecuentes
                </h2>
                <p className="text-lg text-zinc-400">
                  Respondemos las dudas más comunes.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <FAQ />
            </Reveal>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-6 md:px-10 text-center space-y-8">
            <Reveal>
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">
                  ¿Listo para vender más por WhatsApp?
                </h2>
                <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                  Únete a emprendedores y pymes que ya están usando Lula.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {!loggedIn && (
                  <>
                    <Link
                      href="/signup"
                      className={cn(buttonVariants({ size: "lg" }), "bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-[0_0_30px_rgba(16,185,129,0.4)]")}
                    >
                      Crear cuenta gratis
                    </Link>
                    <a
                      href="https://wa.me/573012463004"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ size: "lg", variant: "outline" }), "border-white/10 text-white hover:bg-white/5")}
                    >
                      Escríbenos por WhatsApp
                    </a>
                    {/* TODO(luis): confirmar número WhatsApp comercial */}
                  </>
                )}
                {loggedIn && (
                  <Link
                    href="/panel"
                    className={cn(buttonVariants({ size: "lg" }), "bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-[0_0_30px_rgba(16,185,129,0.4)]")}
                  >
                    Ir al panel
                  </Link>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 bg-zinc-950/60 py-12">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black font-bold text-sm">
                    L
                  </div>
                  <span className="font-semibold text-white">Lula</span>
                </div>
                <p className="text-xs text-zinc-500">
                  WhatsApp para vender más, desde Colombia.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Producto</h4>
                <ul className="space-y-2 text-xs text-zinc-500">
                  <li>
                    <a href="#funciones" className="hover:text-white transition-colors">
                      Funciones
                    </a>
                  </li>
                  <li>
                    <a href="#precio" className="hover:text-white transition-colors">
                      Precio
                    </a>
                  </li>
                  <li>
                    <a href="#faq" className="hover:text-white transition-colors">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Legal</h4>
                <ul className="space-y-2 text-xs text-zinc-500">
                  <li>
                    <a href="#" className="hover:text-white transition-colors">
                      Privacidad
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-white transition-colors">
                      Términos
                    </a>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Contacto</h4>
                <ul className="space-y-2 text-xs text-zinc-500">
                  <li>
                    <a
                      href="https://wa.me/573012463004"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white transition-colors"
                    >
                      WhatsApp
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-zinc-600">
                © 2026 Lula. Todos los derechos reservados.
              </p>
              <p className="text-xs text-zinc-600">luladev.com</p>
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
              "@type": "Offer",
              priceCurrency: "COP",
              price: "250000",
              pricingPattern: "https://schema.org/RecurringPricing",
            },
            operatingSystem: "Web",
            inLanguage: "es-CO",
          }),
        }}
      />
    </>
  );
}
