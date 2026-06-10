import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaignRecipients, campaigns } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { sendTemplate, sendFlow } from "@/lib/meta/client";
import { buildSendComponents, type ComponentPlan, type FlowPlan } from "./component-plan";
import { TokenBucket } from "./rate-limit";

export interface SenderWorker {
  runCampaign(campaignId: string): Promise<void>;
}

export class InProcessSenderWorker implements SenderWorker {
  constructor(private db: DB) {}

  async runCampaign(campaignId: string): Promise<void> {
    const [camp] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!camp) throw new Error(`Campaign ${campaignId} not found`);

    const settings = await getOrgSettings(this.db, camp.orgId);
    const bucket = new TokenBucket(settings.rateLimitMps, settings.rateLimitMps);

    await this.db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, campaignId));

    const pending = await this.db
      .select()
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "pending")));

    for (const rec of pending) {
      await bucket.take();

      const plan = camp.componentPlanJson ? JSON.parse(camp.componentPlanJson) as ComponentPlan : null;
      let result;

      if (plan && plan.kind === "flow") {
        const flowPlan = plan as FlowPlan;
        result = await sendFlow(settings, {
          to: rec.phone,
          flowId: flowPlan.flowId,
          cta: flowPlan.cta,
          bodyText: flowPlan.bodyText,
        });
      } else {
        const params = JSON.parse(rec.params) as Record<string, string>;
        let components: unknown[];
        if (plan && (plan.kind === "standard" || plan.kind === "carousel")) {
          components = buildSendComponents(plan, params);
        } else {
          components =
            Object.keys(params).length > 0
              ? [{ type: "body", parameters: Object.values(params).map((v) => ({ type: "text", text: v })) }]
              : [];
        }

        result = await sendTemplate(settings, {
          to: rec.phone,
          templateName: camp.templateName,
          language: camp.templateLanguage,
          components,
        });
      }

      const now = new Date();
      if ("error" in result) {
        await this.db
          .update(campaignRecipients)
          .set({ status: "failed", error: `${result.error.type}: ${result.error.message}`, sentAt: now })
          .where(eq(campaignRecipients.id, rec.id));
        await this.db
          .update(campaigns)
          .set({ failed: sql`${campaigns.failed} + 1` })
          .where(eq(campaigns.id, campaignId));
      } else {
        await this.db
          .update(campaignRecipients)
          .set({ status: "sent", wamid: result.wamid, sentAt: now })
          .where(eq(campaignRecipients.id, rec.id));
        await this.db
          .update(campaigns)
          .set({ sent: sql`${campaigns.sent} + 1` })
          .where(eq(campaigns.id, campaignId));
      }
    }

    await this.db.update(campaigns).set({ status: "done" }).where(eq(campaigns.id, campaignId));
  }
}

let _singleton: InProcessSenderWorker | null = null;
export function getWorker(db: DB): SenderWorker {
  if (!_singleton) _singleton = new InProcessSenderWorker(db);
  return _singleton;
}
