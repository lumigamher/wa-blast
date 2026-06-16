import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaignRecipients, campaigns } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { sendTemplate, sendFlow } from "@/lib/meta/client";
import { buildSendComponents, type ComponentPlan, type FlowPlan } from "./component-plan";
import { TokenBucket } from "./rate-limit";
import { getOrCreateConversation, recordOutboundMessage } from "@/lib/inbox/store";
import { listTemplates, credsFromSettings } from "@/lib/meta/graph";
import type { ButtonSpec } from "@/lib/meta/types";

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

    // Fetch template metadata once for all recipients (templates are reused)
    let templateMetadata: Record<string, { bodyText: string; buttons: ButtonSpec[]; headerType?: string }> | null = null;
    if (!camp.componentPlanJson || JSON.parse(camp.componentPlanJson).kind !== "flow") {
      try {
        const creds = credsFromSettings(settings);
        if (creds) {
          const templates = await listTemplates(creds);
          const template = templates.find((t) => t.name === camp.templateName);
          if (template) {
            // Extract body text and buttons from template components
            const bodyComp = template.components.find((c) => c.type === "BODY");
            const buttonsComp = template.components.find((c) => c.type === "BUTTONS");
            const headerComp = template.components.find((c) => c.type === "HEADER");

            const buttonSpecs: ButtonSpec[] = [];
            if (buttonsComp?.buttons) {
              for (const btn of buttonsComp.buttons) {
                if (btn.type === "QUICK_REPLY") {
                  buttonSpecs.push({ type: "QUICK_REPLY", text: btn.text });
                } else if (btn.type === "URL") {
                  buttonSpecs.push({ type: "URL", text: btn.text, url: btn.url || "" });
                } else if (btn.type === "PHONE_NUMBER") {
                  buttonSpecs.push({ type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number || "" });
                }
              }
            }

            templateMetadata = {
              [camp.templateName]: {
                bodyText: bodyComp?.text || "",
                buttons: buttonSpecs,
                headerType: headerComp?.format,
              },
            };
          }
        }
      } catch {
        // Silently continue if template fetch fails; we'll use fallback body
      }
    }

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
        // Campaign send succeeded; record it in inbox (best-effort, don't block on failure)
        try {
          const conv = await getOrCreateConversation(this.db, camp.orgId, rec.phone, now);
          const params = JSON.parse(rec.params) as Record<string, string>;

          let payloadJson: string | null = null;
          if (plan && plan.kind === "flow") {
            const flowPlan = plan as FlowPlan;
            payloadJson = JSON.stringify({
              kind: "flow",
              flowId: flowPlan.flowId,
              cta: flowPlan.cta,
              bodyText: flowPlan.bodyText,
            });
          } else if (templateMetadata && camp.templateName in templateMetadata) {
            const tmpl = templateMetadata[camp.templateName];
            // Substitute params into body text: {{1}}, {{2}}, etc.
            let renderedBody = tmpl.bodyText;
            const paramValues = Object.values(params);
            for (let i = 0; i < paramValues.length; i++) {
              renderedBody = renderedBody.replace(`{{${i + 1}}}`, paramValues[i]);
            }

            payloadJson = JSON.stringify({
              kind: "template",
              templateName: camp.templateName,
              language: camp.templateLanguage,
              headerType: tmpl.headerType,
              bodyText: renderedBody,
              buttons: tmpl.buttons,
            });
          }

          const messageBody = payloadJson
            ? JSON.parse(payloadJson).bodyText || `[plantilla ${camp.templateName}]`
            : `[plantilla ${camp.templateName}]`;

          await recordOutboundMessage(this.db, {
            orgId: camp.orgId,
            conversationId: conv.id,
            wamid: result.wamid,
            type: plan && plan.kind === "flow" ? "flow" : "template",
            body: messageBody,
            status: "sent",
            payloadJson,
          });
        } catch {
          // Silently continue if inbox recording fails; campaign send already succeeded
        }

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
