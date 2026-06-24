"use client";

import { usePathname } from "next/navigation";

export function InboxShell({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasDetail = /^\/inbox\/.+/.test(pathname);

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* List pane: hidden on mobile when detail is open, always shown on md+ */}
      <div
        className={`${
          hasDetail ? "hidden md:flex" : "flex"
        } w-full shrink-0 flex-col border-r md:w-[360px]`}
      >
        {list}
      </div>

      {/* Detail pane: hidden on mobile when list is shown, shown when detail is open */}
      <div
        className={`${
          hasDetail ? "flex" : "hidden md:flex"
        } min-h-0 flex-1 flex-col`}
      >
        {detail}
      </div>
    </div>
  );
}
