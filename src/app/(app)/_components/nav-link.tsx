"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

const AllHrefsContext = createContext<string[]>([]);

export function NavGroup({ hrefs, children }: { hrefs: string[]; children: React.ReactNode }) {
  return <AllHrefsContext.Provider value={hrefs}>{children}</AllHrefsContext.Provider>;
}

export function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  const path = usePathname();
  const allHrefs = useContext(AllHrefsContext);

  const active = (() => {
    if (href === "/") return path === "/";
    if (path === href) return true;
    if (!path.startsWith(href + "/")) return false;
    // longest prefix wins: if another registered href is a better match, we lose
    const better = allHrefs.some(
      (other) => other !== href && other.length > href.length && (path === other || path.startsWith(other + "/")),
    );
    return !better;
  })();

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-accent/40 hover:text-sidebar-foreground",
      )}
    >
      <span className={cn("transition-transform", active && "scale-110")}>{icon}</span>
      {label}
    </Link>
  );
}
