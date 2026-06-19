import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { checkModuleGate } from "@/lib/billing/access";
import type { ModuleId } from "@/lib/billing/plans";
import { requireOrg } from "@/lib/auth/session";

/**
 * Server-side guard for module-gated pages.
 * If the org doesn't have access to the module, redirects to /facturacion?upgrade=<module>.
 * Call this at the top of a server component.
 */
export async function requireModuleAccess(module: ModuleId): Promise<void> {
  const { orgId } = await requireOrg();
  const hasAccess = await checkModuleGate(db, orgId, module);
  if (!hasAccess) {
    redirect(`/facturacion?upgrade=${module}`);
  }
}
