"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
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

export function NavSection({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const path = usePathname();

  // Lazy initialization: compute initial state
  // Uses localStorage on first render, then path-based auto-open if no stored preference
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;

    const storageKey = `nav-section-${label}`;
    const stored = localStorage.getItem(storageKey);

    if (stored !== null) {
      return stored === "true";
    }

    // Auto-open if any child contains the current path
    const childHrefs = extractChildHrefs(children);
    const hasActive = childHrefs.some((href) => {
      if (href === "/") return path === "/";
      if (path === href) return true;
      if (path.startsWith(href + "/")) return true;
      return false;
    });

    return hasActive || defaultOpen;
  });

  const toggleOpen = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    localStorage.setItem(`nav-section-${label}`, newState.toString());
  };

  // Respect prefers-reduced-motion
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="space-y-1">
      <button
        onClick={toggleOpen}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-accent/30",
        )}
        aria-expanded={isOpen}
      >
        <span>{label}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform",
            isOpen && "rotate-180",
            !prefersReducedMotion && "duration-200",
          )}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all",
          !prefersReducedMotion && "duration-200",
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="space-y-0.5">{children}</div>
      </div>
    </div>
  );
}

// Helper to extract hrefs from NavLink children
function extractChildHrefs(children: React.ReactNode): string[] {
  const hrefs: string[] = [];

  const traverse = (node: React.ReactNode): void => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(traverse);
    } else if (typeof node === "object" && node !== null && "props" in node) {
      const props = node.props as Record<string, unknown>;
      if (typeof props.href === "string") {
        hrefs.push(props.href);
      }
      if (props.children !== undefined) {
        traverse(props.children as React.ReactNode);
      }
    }
  };

  traverse(children);
  return hrefs;
}
