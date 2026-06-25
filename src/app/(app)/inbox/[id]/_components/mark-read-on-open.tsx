"use client";

import { useEffect } from "react";
import { markReadAction } from "../../actions";

export function MarkReadOnOpen({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    // Call markReadAction to handle Meta API call (best-effort)
    markReadAction(conversationId).catch(() => {
      // Ignore errors; local mark-as-read already succeeded server-side
    });
  }, [conversationId]);

  return null;
}
