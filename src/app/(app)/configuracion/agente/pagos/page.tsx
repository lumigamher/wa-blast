import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import { listPaymentMethods } from "@/lib/agent/payments/methods";
import { AgentPayments } from "../_payments";

export const dynamic = "force-dynamic";

export default async function PagosPage() {
  const { orgId } = await requireOrg();

  const paymentList = await listPaymentMethods(db, orgId);

  return <AgentPayments items={paymentList} />;
}
