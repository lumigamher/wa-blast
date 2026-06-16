import { createHmac } from "node:crypto";

type IceServer = { urls: string; username?: string; credential?: string };

export function buildIceServers(opts: {
  turnUrl?: string;
  turnTlsUrl?: string;
  turnSecret?: string;
  nowSec: number;
  ttlSec?: number;
}): IceServer[] {
  const servers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (opts.turnSecret) {
    const username = String(opts.nowSec + (opts.ttlSec ?? 3600));
    const credential = createHmac("sha1", opts.turnSecret).update(username).digest("base64");
    if (opts.turnUrl) servers.push({ urls: opts.turnUrl, username, credential });
    if (opts.turnTlsUrl) servers.push({ urls: opts.turnTlsUrl, username, credential });
  }
  return servers;
}
