"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/client";

export function FinalCTA() {
  const { data: session } = useSession();
  const loggedIn = !!session;

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      {!loggedIn && (
        <>
          <Link
            href="/signup"
            className="rounded-full bg-neutral-950 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Crear cuenta gratis
          </Link>
          <a
            href="https://wa.me/573012463004"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-neutral-200 text-neutral-950 px-6 py-3 text-sm font-medium hover:bg-neutral-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Contactar por WhatsApp
          </a>
        </>
      )}
      {loggedIn && (
        <Link
          href="/panel"
          className="rounded-full bg-neutral-950 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Ir al panel
        </Link>
      )}
    </div>
  );
}
