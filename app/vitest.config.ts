import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests cover the pure lib logic (scheduling maths, money/format helpers,
// and — as they land — pricing, permissions and extraction mappers). These have
// no React/DOM dependency, so the fast `node` environment is all we need.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
