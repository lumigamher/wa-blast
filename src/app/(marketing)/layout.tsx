import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lula — Campañas, inbox y formularios para WhatsApp",
  description:
    "Convierte tu WhatsApp en una máquina de ventas: campañas masivas, bandeja de entrada en tiempo real y formularios creados con IA, sobre la API oficial de Meta. Hecho en Colombia.",
  openGraph: {
    title: "Lula — WhatsApp para vender más",
    description:
      "Campañas masivas, inbox y formularios con IA sobre la API oficial de WhatsApp.",
    url: "https://luladev.com",
    siteName: "Lula",
    locale: "es_CO",
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
