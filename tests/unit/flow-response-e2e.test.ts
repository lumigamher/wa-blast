import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { contacts, flowResponses, organization } from "@/lib/db/schema";
import { recordInboundMessage } from "@/lib/inbox/store";

function flowPayload(fields: Record<string, unknown>) {
  return JSON.stringify({
    type: "interactive",
    interactive: {
      type: "nfm_reply",
      nfm_reply: { name: "flow", response_json: JSON.stringify(fields) },
    },
  });
}

describe("flow response end-to-end (recordInboundMessage)", () => {
  it("persiste flow_responses, enriquece el contacto y es idempotente", async () => {
    const { db } = makeTestDb();
    await db
      .insert(organization)
      .values({ id: "o1", name: "o1", slug: "o1", createdAt: new Date() });

    const payload = flowPayload({
      flow_token: "tok",
      nombre: "Ana",
      ciudad: "Cali",
      mensaje: "quiero info",
    });

    await recordInboundMessage(db, {
      orgId: "o1",
      phone: "+57300",
      wamid: "wamid.flow.1",
      parsed: {
        type: "flow",
        body: "nombre: Ana",
        mediaId: null,
        payloadJson: payload,
        replyToWamid: null,
      },
      ts: new Date(),
      profileName: null,
    });

    // 1) respuesta persistida de forma estructurada (sin flow_token)
    const rows = await db
      .select()
      .from(flowResponses)
      .where(eq(flowResponses.orgId, "o1"));
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].fieldsJson)).toEqual({
      nombre: "Ana",
      ciudad: "Cali",
      mensaje: "quiero info",
    });
    expect(rows[0].phone).toBe("+57300");

    // 2) contacto enriquecido (campos vacíos rellenados)
    const c = (
      await db.select().from(contacts).where(eq(contacts.phone, "+57300"))
    )[0];
    expect(c.name).toBe("Ana");
    expect(c.city).toBe("Cali");

    // 3) idempotencia: reprocesar el mismo wamid no duplica
    await recordInboundMessage(db, {
      orgId: "o1",
      phone: "+57300",
      wamid: "wamid.flow.1",
      parsed: {
        type: "flow",
        body: "x",
        mediaId: null,
        payloadJson: payload,
        replyToWamid: null,
      },
      ts: new Date(),
      profileName: null,
    });
    const rows2 = await db
      .select()
      .from(flowResponses)
      .where(eq(flowResponses.orgId, "o1"));
    expect(rows2).toHaveLength(1);
  });
});
