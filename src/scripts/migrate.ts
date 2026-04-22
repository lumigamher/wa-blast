import { runMigrations } from "@/lib/db/client";

runMigrations();
console.log("migrations applied");
