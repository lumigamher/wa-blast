import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
    pool: "forks",
    globals: true,
    server: {
      deps: {
        inline: ["zod"],
      },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
