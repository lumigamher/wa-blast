import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { campaignRecipients, campaigns, templateCardMedia } from "@/lib/db/schema";
import { getOrgSettings } from "@/lib/org/settings";
import { sendTemplate, sendFlow } from "@/lib/meta/client";
import { buildSendComponents, type ComponentPlan, type FlowPlan } from "./component-plan";
import { TokenBucket } from "./rate-limit";
import { getOrCreateConversation, recordOutboundMessage } from "@/lib/inbox/store";
import { listTemplates, credsFromSettings } from "@/lib/meta/graph";
import type { ButtonSpec } from "@/lib/meta/types";
import { saveMediaAsset, publicMediaUrl } from "@/lib/media/store";

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

    await this.db.update(campaigns).set({ status: "sending", statusChangedAt: new Date() }).where(eq(campaigns.id, campaignId));

    const pending = await this.db
      .select()
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "pending")));

    // Fetch template metadata once for all recipients (templates are reused)
    let templateMetadata: Record<string, { bodyText: string; buttons: ButtonSpec[]; headerType?: string }> | null = null;
    // Plantilla ESTÁNDAR con header de media (imagen/video/doc): el plan estándar
    // no lleva el header → Meta rechaza con 132012. Persistimos la imagen aprobada
    // del template en el store público y armamos el componente header UNA vez por
    // campaña (el carrusel ya maneja su propio header con headerLink).
    let standardHeaderComponent: unknown | null = null;
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

            const planKind = camp.componentPlanJson
              ? (JSON.parse(camp.componentPlanJson).kind as string)
              : "standard";
            const hdrFmt = String(headerComp?.format ?? "").toUpperCase();
            const handle = headerComp?.example?.header_handle?.[0];
            if (
              planKind !== "carousel" &&
              handle &&
              (hdrFmt === "IMAGE" || hdrFmt === "VIDEO" || hdrFmt === "DOCUMENT")
            ) {
              try {
                const r = await fetch(handle, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
                if (r.ok) {
                  const bytes = await r.arrayBuffer();
                  const mime =
                    (r.headers.get("content-type") ?? "").split(";")[0].trim() ||
                    (hdrFmt === "VIDEO"
                      ? "video/mp4"
                      : hdrFmt === "DOCUMENT"
                        ? "application/pdf"
                        : "image/jpeg");
                  const asset = await saveMediaAsset(this.db, {
                    orgId: camp.orgId,
                    bytes,
                    mime,
                  });
                  const link = publicMediaUrl(asset.id);
                  const key =
                    hdrFmt === "VIDEO" ? "video" : hdrFmt === "DOCUMENT" ? "document" : "image";
                  const mediaObj: Record<string, unknown> = { link };
                  if (key === "document") mediaObj.filename = "documento.pdf";
                  standardHeaderComponent = {
                    type: "header",
                    parameters: [{ type: key, [key]: mediaObj }],
                  };
                }
              } catch (e) {
                // best-effort: si no se puede preparar la imagen, se envía sin header
                console.warn("[campaign header media]", campaignId, (e as Error)?.message ?? String(e));
              }
            }

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
      } catch (e) {
        // Silently continue if template fetch fails; we'll use fallback body
        console.warn("[campaign template metadata]", campaignId, (e as Error)?.message ?? String(e));
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
        // Plantilla estándar con header de media → anteponer el header resuelto
        // (el carrusel arma su header dentro de buildSendComponents).
        if (standardHeaderComponent && (!plan || plan.kind === "standard")) {
          components = [standardHeaderComponent, ...components];
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
          } else if (plan && plan.kind === "carousel") {
            // Build carousel payload with card details
            type CarouselPlanType = {
              kind: "carousel";
              bodyVarKeys: string[];
              cards: Array<{
                headerFormat: "IMAGE" | "VIDEO";
                headerLink: string;
                bodyVarKeys: string[];
                buttons: Array<{ type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER"; dynamicUrlSuffixKey?: string }>;
              }>;
            };
            const carouselPlan = plan as CarouselPlanType;

            // Render main body text with params
            let mainBodyText = "";
            if (carouselPlan.bodyVarKeys && carouselPlan.bodyVarKeys.length > 0) {
              const paramValues = Object.values(params);
              mainBodyText = paramValues[0] || "";
            }

            // Build cards with rendered body text and media URLs
            const cards = await Promise.all(
              carouselPlan.cards.map(async (card, cardIdx) => {
                // Render card body text: card body uses params like "card.0.body.1"
                let cardBodyText = "";
                if (card.bodyVarKeys && card.bodyVarKeys.length > 0) {
                  // Map "card.0.body.1" -> extract the value from params
                  for (const varKey of card.bodyVarKeys) {
                    if (varKey in params) {
                      cardBodyText = params[varKey];
                      break;
                    }
                  }
                }

                // Get media URL: first try templateCardMedia table, then use headerLink as fallback
                let mediaUrl: string | undefined;
                try {
                  const cardMedia = await this.db
                    .select()
                    .from(templateCardMedia)
                    .where(
                      and(
                        eq(templateCardMedia.orgId, camp.orgId),
                        eq(templateCardMedia.templateName, camp.templateName),
                        eq(templateCardMedia.templateLanguage, camp.templateLanguage),
                        eq(templateCardMedia.cardIndex, cardIdx)
                      )
                    );
                  if (cardMedia.length > 0) {
                    mediaUrl = `/api/inbox/media/${cardMedia[0].assetId}`;
                  } else {
                    // Fallback to headerLink from the plan
                    mediaUrl = card.headerLink;
                  }
                } catch {
                  // If query fails, use headerLink
                  mediaUrl = card.headerLink;
                }

                return {
                  bodyText: cardBodyText,
                  mediaUrl,
                  buttons: card.buttons.map((btn) => ({
                    type: btn.type,
                    text: "", // Button text would come from template metadata; not populated here
                  })),
                };
              })
            );

            payloadJson = JSON.stringify({
              kind: "carousel",
              bodyText: mainBodyText,
              cards,
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
        } catch (e) {
          // Silently continue if inbox recording fails; campaign send already succeeded
          console.warn("[campaign inbox recording]", campaignId, (e as Error)?.message ?? String(e));
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

    await this.db.update(campaigns).set({ status: "done", statusChangedAt: new Date() }).where(eq(campaigns.id, campaignId));
  }
}

let _singleton: InProcessSenderWorker | null = null;
export function getWorker(db: DB): SenderWorker {
  if (!_singleton) _singleton = new InProcessSenderWorker(db);
  return _singleton;
}
