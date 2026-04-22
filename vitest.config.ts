import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
    pool: "forks",
    globals: true,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
