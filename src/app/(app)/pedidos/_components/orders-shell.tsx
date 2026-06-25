"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

export function OrdersShell({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasDetail = /^\/pedidos\/.+/.test(pathname);

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* List pane: hidden on mobile when detail is open, always shown on md+ */}
      <div
        className={`${
          hasDetail ? "hidden md:flex" : "flex"
        } w-full shrink-0 flex-col border-r md:w-[380px]`}
      >
        {list}
      </div>

      {/* Detail pane: hidden on mobile when list is shown, shown when detail is open */}
      <div
        className={`${
          hasDetail ? "flex" : "hidden md:flex"
        } min-h-0 flex-1 flex-col`}
      >
        {/* Mobile back button */}
        {hasDetail && (
          <div className="md:hidden flex items-center gap-2 border-b px-4 py-3">
            <Link href="/pedidos" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeftIcon className="size-4" />
              Pedidos
            </Link>
          </div>
        )}
        {detail}
      </div>
    </div>
  );
}
