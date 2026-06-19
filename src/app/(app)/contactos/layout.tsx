import { requireModuleAccess } from "@/lib/billing/require-module";

// Guard server para toda la sección /contactos (incluye import y tags, que
// son client components y no pueden invocar el guard por sí mismos).
export default async function ContactosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("contactos");
  return children;
}
