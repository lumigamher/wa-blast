import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), ".data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "funes-blast.db"), {
  create: true,
});
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    template_name TEXT NOT NULL,
    template_language TEXT NOT NULL,
    total INTEGER NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_of TEXT
  );

  CREATE TABLE IF NOT EXISTS batch_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    params TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    message_id INTEGER,
    conversation_id INTEGER,
    sent_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON batch_items(batch_id);
  CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created_at DESC);

  CREATE TABLE IF NOT EXISTS template_favorites (
    user_email TEXT NOT NULL,
    template_name TEXT NOT NULL,
    template_language TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_email, template_name, template_language)
  );
`);

// Migraciones idempotentes para columnas nuevas en DBs existentes
const batchItemCols = db
  .query<{ name: string }, []>("PRAGMA table_info(batch_items)")
  .all()
  .map((c) => c.name);
if (!batchItemCols.includes("conversation_id")) {
  db.exec("ALTER TABLE batch_items ADD COLUMN conversation_id INTEGER");
}
const batchCols = db
  .query<{ name: string }, []>("PRAGMA table_info(batches)")
  .all()
  .map((c) => c.name);
if (!batchCols.includes("retry_of")) {
  db.exec("ALTER TABLE batches ADD COLUMN retry_of TEXT");
}

export type BatchRow = {
  id: string;
  created_at: number;
  user_email: string;
  template_name: string;
  template_language: string;
  total: number;
  sent: number;
  failed: number;
  status: "pending" | "running" | "completed" | "failed";
  retry_of: string | null;
};

export type BatchItemRow = {
  id: number;
  batch_id: string;
  phone: string;
  name: string | null;
  params: string;
  status: "pending" | "accepted" | "sent" | "failed";
  error: string | null;
  message_id: number | null;
  conversation_id: number | null;
  sent_at: number | null;
};

export type TemplateFavoriteRow = {
  user_email: string;
  template_name: string;
  template_language: string;
  created_at: number;
};

export function listFavoriteKeys(userEmail: string): Set<string> {
  const rows = db
    .prepare(
      "SELECT template_name, template_language FROM template_favorites WHERE user_email = ?",
    )
    .all(userEmail) as Array<Pick<TemplateFavoriteRow, "template_name" | "template_language">>;
  return new Set(rows.map((r) => `${r.template_name}|${r.template_language}`));
}

export function toggleFavorite(
  userEmail: string,
  name: string,
  language: string,
): { favorited: boolean } {
  const existing = db
    .prepare(
      "SELECT 1 FROM template_favorites WHERE user_email = ? AND template_name = ? AND template_language = ?",
    )
    .get(userEmail, name, language);
  if (existing) {
    db.prepare(
      "DELETE FROM template_favorites WHERE user_email = ? AND template_name = ? AND template_language = ?",
    ).run(userEmail, name, language);
    return { favorited: false };
  }
  db.prepare(
    "INSERT INTO template_favorites (user_email, template_name, template_language, created_at) VALUES (?, ?, ?, ?)",
  ).run(userEmail, name, language, Date.now());
  return { favorited: true };
}
