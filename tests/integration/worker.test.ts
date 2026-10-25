import { afterEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { campaignRecipients, campaigns, contacts, organization, organizationSettings, user } from "@/lib/db/schema";
import { InProcessSenderWorker } from "@/lib/campaigns/worker";
import { encrypt } from "@/lib/crypto/encrypt";

const realFetch = globalThis.fetch;
type FetchFn = typeof fetch;

function setFetch(fn: FetchFn) {
  globalThis.fetch = fn as unknown as typeof fetch;
}

async function seed() {
  const { db } = makeTestDb();
  await db.insert(organization).values({ id: "o", name: "O", createdAt: new Date() });
  await db.insert(organizationSettings).values({
    orgId: "o",
    metaPhoneId: "111",
    metaAccessTokenEnc: encrypt("tok"),
    rateLimitMps: 100,
    updatedAt: new Date(),
  });
  await db.insert(user).values({ id: "u", email: "u@x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(campaigns).values({
    id: "camp",
    orgId: "o",
    name: "T",
    templateName: "promo",
    templateLanguage: "es",
    headerType: "NONE",
    source: "adhoc",
    status: "queued",
    total: 2,
    createdBy: "u",
    createdAt: new Date(),
  });
  await db.insert(campaignRecipients).values([
    { campaignId: "camp", phone: "+57300", params: "{}", status: "pending" },
    { campaignId: "camp", phone: "+57301", params: "{}", status: "pending" },
  ]);
  return db;
}

describe("InProcessSenderWorker", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("sends all recipients, updates counters, marks campaign done", async () => {
    const db = await seed();
    setFetch(
      (async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.AAA" }] }), { status: 200 })) as unknown as FetchFn,
    );

    const worker = new InProcessSenderWorker(db);
    await worker.runCampaign("camp");

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.status).toBe("done");
    expect(camp.sent).toBe(2);

    const recs = await db.select().from(campaignRecipients);
    expect(recs.every((r) => r.status === "sent")).toBe(true);
    expect(recs[0].wamid).toMatch(/^wamid/);
  });

  test("on Meta error, marks recipient failed and increments failed counter", async () => {
    const db = await seed();
    let call = 0;
    setFetch((async () => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({ error: { code: 131008, message: "Bad number" } }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 });
    }) as unknown as FetchFn);

    const worker = new InProcessSenderWorker(db);
    await worker.runCampaign("camp");

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.sent).toBe(1);
    expect(camp.failed).toBe(1);
  });

  test("un destinatario sin identidad NO aborta el resto de la campaña", async () => {
    const db = await seed();
    // Fila corrupta en medio: ni teléfono ni BSUID. Antes reventaba el bucle
    // entero y los pendientes nunca se enviaban.
    await db.insert(campaignRecipients).values({
      campaignId: "camp", phone: null, bsuid: null, params: "{}", status: "pending",
    });
    setFetch(
      (async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 })) as unknown as FetchFn,
    );

    const worker = new InProcessSenderWorker(db);
    await worker.runCampaign("camp");

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    // Los dos buenos salieron; solo el corrupto quedó marcado
    expect(camp.sent).toBe(2);
    expect(camp.failed).toBe(1);
    expect(camp.status).toBe("done");
    const recs = await db.select().from(campaignRecipients);
    const malo = recs.find((r) => !r.phone && !r.bsuid);
    expect(malo?.status).toBe("failed");
    expect(malo?.error ?? "").toMatch(/destinatario/i);
  });

  test("envía por BSUID a quien no tiene teléfono visible", async () => {
    const db = await seed();
    await db.insert(campaignRecipients).values({
      campaignId: "camp", phone: null, bsuid: "US.777", params: "{}", status: "pending",
    });
    let cuerpo: Record<string, unknown> = {};
    setFetch((async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body ?? "{}"));
      if (b.recipient) cuerpo = b;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 });
    }) as unknown as FetchFn);

    const worker = new InProcessSenderWorker(db);
    await worker.runCampaign("camp");

    expect(cuerpo.recipient).toBe("US.777");
    expect(cuerpo.to).toBeUndefined();
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.sent).toBe(3);
  });

  const ok = () => new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 });

  test("reserva atómica: una fila ya en sending no se envía", async () => {
    const db = await seed();
    await db.update(campaignRecipients).set({ status: "sending" }).where(eq(campaignRecipients.phone, "+57300"));
    const urls: string[] = [];
    setFetch((async (_u: string, init?: RequestInit) => {
      urls.push(String(init?.body));
      return ok();
    }) as unknown as FetchFn);
    await new InProcessSenderWorker(db).runCampaign("camp");
    expect(urls.filter((b) => b.includes("+57300"))).toHaveLength(0);
    const recs = await db.select().from(campaignRecipients);
    expect(recs.find((r) => r.phone === "+57300")?.status).toBe("sending");
    expect(recs.find((r) => r.phone === "+57301")?.status).toBe("sent");
  });

  test("opt-out: contacto dado de baja (por teléfono o BSUID) no se envía y suma failed", async () => {
    const db = await seed();
    const ts = new Date();
    await db.insert(contacts).values({ id: "c1", orgId: "o", phone: "+57300", optOutAt: ts, createdAt: ts, updatedAt: ts });
    // Contacto de OTRA org con la misma identidad: no debe bloquear
    await db.insert(organization).values({ id: "o2", name: "O2", createdAt: ts });
    await db.insert(contacts).values({ id: "c2", orgId: "o2", phone: "+57301", optOutAt: ts, createdAt: ts, updatedAt: ts });
    let llamadas = 0;
    setFetch((async () => { llamadas++; return ok(); }) as unknown as FetchFn);
    await new InProcessSenderWorker(db).runCampaign("camp");
    expect(llamadas).toBe(1);
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.failed).toBe(1);
    expect(camp.sent).toBe(1);
    const recs = await db.select().from(campaignRecipients);
    const baja = recs.find((r) => r.phone === "+57300");
    expect(baja?.status).toBe("failed");
    expect(baja?.error).toBe("El contacto se dio de baja");
  });

  test("130429: reintenta con 2s, 4s y termina en sent", async () => {
    const db = await seed();
    await db.delete(campaignRecipients).where(eq(campaignRecipients.phone, "+57301"));
    let call = 0;
    setFetch((async () => {
      call++;
      if (call <= 2) {
        return new Response(JSON.stringify({ error: { code: 130429, message: "rate" } }), { status: 429 });
      }
      return ok();
    }) as unknown as FetchFn);
    const esperas: number[] = [];
    const worker = new InProcessSenderWorker(db, { sleep: async (ms) => { esperas.push(ms); } });
    await worker.runCampaign("camp");
    expect(esperas).toEqual([2000, 4000]);
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.sent).toBe(1);
    expect(camp.failed).toBe(0);
  });

  test("130429 persistente: tras 3 reintentos queda failed", async () => {
    const db = await seed();
    await db.delete(campaignRecipients).where(eq(campaignRecipients.phone, "+57301"));
    let call = 0;
    setFetch((async () => {
      call++;
      return new Response(JSON.stringify({ error: { code: 131056, message: "pair" } }), { status: 400 });
    }) as unknown as FetchFn);
    const esperas: number[] = [];
    await new InProcessSenderWorker(db, { sleep: async (ms) => { esperas.push(ms); } }).runCampaign("camp");
    expect(call).toBe(4);
    expect(esperas).toEqual([2000, 4000, 8000]);
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
    expect(camp.failed).toBe(1);
  });

  test("heartbeat: statusChangedAt se fija al iniciar y se renueva durante el bucle", async () => {
    const db = await seed();
    const t0 = Math.floor(Date.now() / 1000) * 1000 + 3_600_000;
    let t = t0;
    const vistos: number[] = [];
    setFetch((async () => {
      const [c] = await db.select().from(campaigns).where(eq(campaigns.id, "camp"));
      vistos.push(c.statusChangedAt!.getTime());
      return ok();
    }) as unknown as FetchFn);
    // cada lectura del reloj avanza 20 s: el segundo destinatario ya debe renovar
    const worker = new InProcessSenderWorker(db, { now: () => (t += 20_000) });
    await worker.runCampaign("camp");
    expect(vistos[0]).toBeGreaterThanOrEqual(t0);
    expect(vistos[1]).toBeGreaterThan(vistos[0]);
  });
});
