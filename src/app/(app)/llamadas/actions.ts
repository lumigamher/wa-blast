"use server";

import { db } from "@/lib/db/client";
import { requireOrg } from "@/lib/auth/session";
import {
  getCallById,
  getRingingCalls,
  markCallConnected,
  markCallRejected,
  type RingingCall,
} from "@/lib/calls/store";
import { acceptCall, placeCall, rejectCall, requestCallPermission, terminateCall } from "@/lib/meta/calling";
import { getOrgSettings } from "@/lib/org/settings";
import { buildIceServers } from "@/lib/calls/ice";
import { createOutboundCall, getContactCallPermission } from "@/lib/calls/store";
import { getOrCreateConversation } from "@/lib/inbox/store";
import { contacts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/lib/env";

type IceServer = { urls: string; username?: string; credential?: string };

export async function pollRingingCallsAction(): Promise<RingingCall[]> {
  const { orgId } = await requireOrg();
  return getRingingCalls(db, orgId);
}

export async function getIceServersAction(): Promise<IceServer[]> {
  await requireOrg();
  return buildIceServers({
    turnUrl: env.TURN_URL,
    turnTlsUrl: env.TURN_TLS_URL,
    turnSecret: env.TURN_SECRET,
    nowSec: Math.floor(Date.now() / 1000),
  });
}

export async function getCallOfferAction(callId: string): Promise<{ sdp: string } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call?.sdp) return { error: "Sin oferta SDP" };
  return { sdp: call.sdp };
}

export async function acceptCallAction(
  callId: string,
  answerSdp: string,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  const settings = await getOrgSettings(db, orgId);
  const res = await acceptCall(settings, call.wacid, answerSdp);
  if ("ok" in res) await markCallConnected(db, orgId, callId, new Date());
  return res;
}

export async function rejectCallAction(callId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  const settings = await getOrgSettings(db, orgId);
  const res = await rejectCall(settings, call.wacid);
  if ("ok" in res) await markCallRejected(db, orgId, callId);
  return res;
}

export async function terminateCallAction(callId: string): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  const settings = await getOrgSettings(db, orgId);
  return terminateCall(settings, call.wacid);
}

export async function getCallPermissionAction(contactId: string) {
  const { orgId } = await requireOrg();
  return getContactCallPermission(db, orgId, contactId);
}

export async function requestCallPermissionAction(
  contactId: string,
): Promise<{ ok: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  if (!c) return { error: "Contacto no encontrado" };
  const settings = await getOrgSettings(db, orgId);
  return requestCallPermission(settings, c.phone);
}

export async function placeCallAction(
  contactId: string,
  offerSdp: string,
): Promise<{ ok: true; callId: string; conversationId: string } | { error: string }> {
  const { orgId } = await requireOrg();
  const perm = await getContactCallPermission(db, orgId, contactId);
  if (!perm.valid) return { error: "Sin permiso de llamada vigente" };
  const [c] = await db.select().from(contacts).where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  if (!c) return { error: "Contacto no encontrado" };
  const settings = await getOrgSettings(db, orgId);
  const conv = await getOrCreateConversation(db, orgId, c.phone, new Date());
  const res = await placeCall(settings, offerSdp, c.phone);
  if ("error" in res) return res;
  const id = await createOutboundCall(db, { orgId, conversationId: conv.id, phone: c.phone, wacid: res.callId });
  return { ok: true, callId: id, conversationId: conv.id };
}

export async function getCallAnswerAction(
  callId: string,
): Promise<{ sdp: string } | { pending: true } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  if (!call.answerSdp) return { pending: true };
  return { sdp: call.answerSdp };
}

/** Estado actual de la llamada (la otra parte que cuelga llega como terminate→status terminal). */
export async function getCallStatusAction(
  callId: string,
): Promise<{ status: string } | { error: string }> {
  const { orgId } = await requireOrg();
  const call = await getCallById(db, orgId, callId);
  if (!call) return { error: "Llamada no encontrada" };
  return { status: call.status };
}
