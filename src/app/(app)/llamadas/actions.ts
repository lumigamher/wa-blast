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
import { acceptCall, rejectCall, terminateCall } from "@/lib/meta/calling";
import { getOrgSettings } from "@/lib/org/settings";
import { buildIceServers } from "@/lib/calls/ice";
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
