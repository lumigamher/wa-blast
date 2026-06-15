"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

type Result = { ok: boolean; message: string };

export function ToastForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<Result>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(
    async (_prev: Result | null, fd: FormData) => action(fd),
    null,
  );
  const seen = useRef<Result | null>(null);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  );
}
