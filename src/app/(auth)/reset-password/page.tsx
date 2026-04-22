"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm">Loading…</p>}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const sp = useSearchParams();
  const token = sp.get("token");
  if (token) return <Reset token={token} />;
  return <Request />;
}

function Request() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forget-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return <p className="text-sm">If that email exists, a reset link was sent.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">Reset password</h1>
      <input
        required
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
      <button
        disabled={loading}
        className="w-full rounded bg-primary text-primary-foreground py-2 disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

function Reset({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await authClient.resetPassword({ newPassword: pw, token });
    setLoading(false);
    if (res.error) {
      setErr(res.error.message ?? "Reset failed");
      return;
    }
    setDone(true);
  }

  if (done) return <p className="text-sm">Password changed. You can log in now.</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <input
        required
        minLength={8}
        type="password"
        placeholder="New password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        disabled={loading}
        className="w-full rounded bg-primary text-primary-foreground py-2 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
