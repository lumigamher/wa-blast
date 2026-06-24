"use client";

import { usePathname } from "next/navigation";

export function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInbox = pathname.startsWith("/inbox");

  if (isInbox) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-8 md:px-10 md:py-10 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        {children}
      </div>
    </div>
  );
}
