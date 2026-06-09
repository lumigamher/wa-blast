import { MetaApiError, type GraphCreds } from "./graph";

const GRAPH_API = "https://graph.facebook.com/v22.0";

export type FlowCategory =
  | "SIGN_UP" | "SIGN_IN" | "APPOINTMENT_BOOKING" | "LEAD_GENERATION"
  | "CONTACT_US" | "CUSTOMER_SUPPORT" | "SURVEY" | "OTHER";

export type Flow = { id: string; name: string; status: string; categories: string[] };

export function buildCreateFlowBody(input: { name: string; categories: FlowCategory[]; flowJson: string }): Record<string, unknown> {
  return { name: input.name, categories: input.categories, flow_json: input.flowJson };
}

async function flowRequest<T>(creds: GraphCreds, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${creds.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number } } | null)?.error;
    throw new MetaApiError(err?.code ?? res.status, undefined, body, err?.message ?? `Meta ${res.status}`);
  }
  return body as T;
}

export async function createFlow(creds: GraphCreds, input: { name: string; categories: FlowCategory[]; flowJson: string }): Promise<{ id: string }> {
  return flowRequest(creds, `/${creds.wabaId}/flows`, { method: "POST", body: JSON.stringify(buildCreateFlowBody(input)) });
}

export async function publishFlow(creds: GraphCreds, flowId: string): Promise<{ success?: boolean }> {
  return flowRequest(creds, `/${flowId}`, { method: "POST", body: JSON.stringify({ status: "PUBLISHED" }) });
}

export async function listFlows(creds: GraphCreds): Promise<Flow[]> {
  const res = await flowRequest<{ data?: Flow[] }>(creds, `/${creds.wabaId}/flows?fields=id,name,status,categories&limit=100`);
  return res.data ?? [];
}

export async function createAndPublishFlow(creds: GraphCreds, input: { name: string; categories: FlowCategory[]; flowJson: string }): Promise<{ id: string; status: string }> {
  const { id } = await createFlow(creds, input);
  await publishFlow(creds, id);
  return { id, status: "PUBLISHED" };
}
