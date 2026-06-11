"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavProps {
  loggedIn: boolean;
}

export function Nav({ loggedIn }: NavProps) {
  return (
    <nav className="sticky top-0 z-40 w-full backdrop-blur-xl bg-black/40 ring-1 ring-white/10">
      <div className="mx-auto max-w-6xl px-6 py-4 md:px-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black font-bold text-sm">
            L
          </div>
          <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
            Lula
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a
            href="#funciones"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Funciones
          </a>
          <a
            href="#precio"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Precio
          </a>
          <a
            href="#faq"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-3">
          {!loggedIn && (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost" }), "text-sm text-zinc-300 hover:text-white")}
              >
                Entrar
              </Link>
              <Link
                href="/signup"
                className={cn(buttonVariants({ variant: "default" }), "bg-emerald-500 hover:bg-emerald-400 text-black font-medium shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] transition-shadow text-sm")}
              >
                Crear cuenta gratis
              </Link>
            </>
          )}
          {loggedIn && (
            <Link
              href="/panel"
              className={cn(buttonVariants({ variant: "default" }), "bg-emerald-500 hover:bg-emerald-400 text-black font-medium shadow-[0_0_30px_rgba(16,185,129,0.4)] text-sm")}
            >
              Ir al panel
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
