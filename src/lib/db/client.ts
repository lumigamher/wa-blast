import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "@/lib/env";
import * as schema from "./schema";

if (env.DATABASE_URL !== ":memory:") {
  mkdirSync(dirname(env.DATABASE_URL), { recursive: true });
}

const sqlite = new Database(env.DATABASE_URL);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
// Espera hasta 5 s si otra conexión (migración, backup, script) tiene el lock,
// en vez de fallar al instante con SQLITE_BUSY.
sqlite.pragma("busy_timeout = 5000");
// NORMAL es seguro con WAL y evita un fsync por transacción.
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema, casing: "snake_case" });
export type DB = typeof db;

export function runMigrations() {
  migrate(db, { migrationsFolder: "drizzle/migrations" });
}
