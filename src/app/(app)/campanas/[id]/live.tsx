"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
};

export function Live({ campaignId, initial }: { campaignId: string; initial: Campaign }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/status`);
      if (!active) return;
      if (res.ok) {
        const json = (await res.json()) as Campaign;
        setData(json);
      }
    };
    const id = setInterval(tick, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [campaignId]);

  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">{data.name}</h1>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Stat label="Estado" value={data.status} />
        <Stat label="Total" value={data.total} />
        <Stat label="Enviados" value={data.sent} />
        <Stat label="Entregados" value={data.delivered} />
        <Stat label="Leídos" value={data.read} />
        <Stat label="Fallidos" value={data.failed} />
        <Stat label="Respondieron" value={data.replied} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
