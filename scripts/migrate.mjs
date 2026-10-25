/**
 * Aplica las migraciones de drizzle/migrations. Reemplaza a `drizzle-kit migrate`
 * porque ese comando no fija busy_timeout: si la app tiene el lock de escritura
 * durante el deploy, fallaba al instante con SQLITE_BUSY.
 *
 * Abre la DB directamente (sin importar src/lib/db/client.ts, que valida todo el
 * entorno de la app) con los mismos pragmas que el cliente.
 *
 * Es .mjs y corre con Node: better-sqlite3 es un addon nativo que Bun no carga.
 * Uso: DATABASE_URL=/ruta/data.db bun run db:migrate   (por defecto .data/wa-blast.db)
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const url = process.env.DATABASE_URL ?? ".data/wa-blast.db";

if (url !== ":memory:") {
  mkdirSync(dirname(url), { recursive: true });
}

const sqlite = new Database(url);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
// Espera hasta 5 s si la app u otro proceso tiene el lock, en vez de fallar al instante.
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");

try {
  migrate(drizzle(sqlite, { casing: "snake_case" }), {
    migrationsFolder: "drizzle/migrations",
  });
  console.log(`Migraciones aplicadas en ${url}`);
} finally {
  sqlite.close();
}
