"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/client";

export function Nav() {
  const { data: session } = useSession();
  const loggedIn = !!session;
  return (
    <nav className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 py-3 md:px-10 flex items-center justify-between h-14">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-medium text-neutral-950 group-hover:text-neutral-700 transition-colors">
            Lula
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#funciones"
            className="text-sm text-neutral-600 hover:text-neutral-950 transition-colors"
          >
            Producto
          </a>
          <a
            href="#precio"
            className="text-sm text-neutral-600 hover:text-neutral-950 transition-colors"
          >
            Precio
          </a>
          <a
            href="#faq"
            className="text-sm text-neutral-600 hover:text-neutral-950 transition-colors"
          >
            FAQ
          </a>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {!loggedIn && (
            <>
              <Link
                href="/login"
                className="text-sm text-neutral-600 hover:text-neutral-950 transition-colors px-3 py-2"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                className="text-sm px-6 py-2 rounded-full bg-neutral-950 text-white hover:bg-neutral-800 transition-colors font-medium"
              >
                Crear cuenta
              </Link>
            </>
          )}
          {loggedIn && (
            <Link
              href="/panel"
              className="text-sm px-6 py-2 rounded-full bg-neutral-950 text-white hover:bg-neutral-800 transition-colors font-medium"
            >
              Ir al panel
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
