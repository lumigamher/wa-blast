"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function Poller() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh if page is visible
      if (!document.hidden) {
        router.refresh();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
