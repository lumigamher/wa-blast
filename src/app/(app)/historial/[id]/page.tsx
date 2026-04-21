import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, type BatchItemRow, type BatchRow } from "@/lib/db";
import { BatchLive } from "./live";

export const dynamic = "force-dynamic";

export default async function BatchDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const batch = db
    .prepare("SELECT * FROM batches WHERE id = ?")
    .get(id) as BatchRow | undefined;
  if (!batch) notFound();

  const items = db
    .prepare("SELECT * FROM batch_items WHERE batch_id = ? ORDER BY id")
    .all(id) as BatchItemRow[];

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          <Link href="/historial" className="hover:underline">
            ← Historial
          </Link>
        </div>
        <h1 className="truncate font-mono text-xl font-semibold tracking-tight">
          {batch.template_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Creado por {batch.user_email} ·{" "}
          {new Date(batch.created_at).toLocaleString("es-CO")}
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progreso</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchLive initialBatch={batch} initialItems={items} />
        </CardContent>
      </Card>
    </div>
  );
}
