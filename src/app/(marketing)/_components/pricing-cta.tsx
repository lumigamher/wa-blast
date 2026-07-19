"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/client";

export function PricingCTA() {
  const { data: session } = useSession();
  const loggedIn = !!session;

  return (
    <div className="space-y-3 pt-2">
      {!loggedIn && (
        <Link
          href="/signup"
          className="w-full block text-center rounded-full bg-neutral-950 text-white py-3 px-6 text-sm font-medium hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Empezar ahora
        </Link>
      )}
      {loggedIn && (
        <Link
          href="/panel"
          className="w-full block text-center rounded-full bg-neutral-950 text-white py-3 px-6 text-sm font-medium hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Ir al panel
        </Link>
      )}

      <p className="text-center text-xs text-neutral-500">
        Sin contrato. Cancela cuando quieras.
      </p>
    </div>
  );
}
