"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

export function MobileBackButton() {
  return (
    <Link
      href="/inbox"
      className="md:hidden inline-flex items-center justify-center size-9 rounded-lg hover:bg-muted transition-colors"
      title="Volver"
    >
      <ChevronLeftIcon className="size-5" />
      <span className="sr-only">Volver a inbox</span>
    </Link>
  );
}
