export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center p-6 bg-muted/30">
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
