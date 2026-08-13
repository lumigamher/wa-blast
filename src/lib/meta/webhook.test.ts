import { describe, expect, it } from "vitest";
import { identityFromWebhook, webhookPayloadSchema } from "./webhook";

/** Envuelve un `value` de cambio en la estructura completa que manda Meta. */
function payload(value: unknown) {
  return { object: "whatsapp_business_account", entry: [{ id: "waba1", changes: [{ field: "messages", value }] }] };
}

const CON_TELEFONO = {
  messaging_product: "whatsapp",
  metadata: { phone_number_id: "123" },
  contacts: [{ wa_id: "573001112233", profile: { name: "Juan" } }],
  messages: [{ from: "573001112233", id: "wamid.1", timestamp: "1786000000", type: "text", text: { body: "hola" } }],
};

/** Usuario con username: Meta OMITE wa_id y from, y manda los *_user_id. */
const SOLO_BSUID = {
  messaging_product: "whatsapp",
  metadata: { phone_number_id: "123" },
  contacts: [{ user_id: "US.13491208655302741918", username: "juanda", profile: { name: "Juan" } }],
  messages: [
    {
      from_user_id: "US.13491208655302741918",
      id: "wamid.2",
      timestamp: "1786000000",
      type: "text",
      text: { body: "hola" },
    },
  ],
};

describe("webhookPayloadSchema", () => {
  it("sigue aceptando el payload clásico con teléfono", () => {
    expect(webhookPayloadSchema.safeParse(payload(CON_TELEFONO)).success).toBe(true);
  });

  it("acepta el payload de un usuario con username, sin teléfono", () => {
    const r = webhookPayloadSchema.safeParse(payload(SOLO_BSUID));
    expect(r.success).toBe(true);
  });

  it("acepta un status sin recipient_id pero con recipient_user_id", () => {
    const r = webhookPayloadSchema.safeParse(
      payload({
        statuses: [
          {
            id: "wamid.3",
            status: "delivered",
            timestamp: "1786000000",
            recipient_user_id: "US.13491208655302741918",
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });
});

describe("identityFromWebhook", () => {
  it("saca teléfono normalizado y nombre del payload clásico", () => {
    const id = identityFromWebhook(CON_TELEFONO.messages[0], CON_TELEFONO.contacts[0]);
    expect(id).toEqual({ phone: "+573001112233", bsuid: null, username: null });
  });

  it("saca el BSUID y el username cuando no hay teléfono", () => {
    const id = identityFromWebhook(SOLO_BSUID.messages[0], SOLO_BSUID.contacts[0]);
    expect(id).toEqual({ phone: null, bsuid: "US.13491208655302741918", username: "juanda" });
  });

  it("toma ambos cuando Meta manda los dos", () => {
    const id = identityFromWebhook(
      { from: "573001112233", from_user_id: "US.999" },
      { wa_id: "573001112233", user_id: "US.999", username: "juanda" },
    );
    expect(id).toEqual({ phone: "+573001112233", bsuid: "US.999", username: "juanda" });
  });

  it("funciona sin bloque contacts (Meta no siempre lo manda)", () => {
    expect(identityFromWebhook({ from_user_id: "US.999" }, undefined)).toEqual({
      phone: null,
      bsuid: "US.999",
      username: null,
    });
  });
});
