import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./lib/pil/__tests__/setup.ts"],
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
