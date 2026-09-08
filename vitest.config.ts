import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@/game": path.resolve(__dirname, "game"),
      "@/lib": path.resolve(__dirname, "lib"),
      "@/types": path.resolve(__dirname, "types"),
    },
  },
});
