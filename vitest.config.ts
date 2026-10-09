import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Tests LENTS (`*.lent.test.ts`) : des mesures statistiques qui jouent des
 * centaines de parties complètes entre bots (échelle de difficulté). Hors de
 * `npm test`, lancés à part par `npm run test:lents` (`vitest.lents.config.ts`).
 */
export const LENTS = "tests/**/*.lent.test.ts";

export const resolve = {
  alias: {
    "@": path.resolve(__dirname, "."),
    "@/game": path.resolve(__dirname, "game"),
    "@/lib": path.resolve(__dirname, "lib"),
    "@/types": path.resolve(__dirname, "types"),
  },
};

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", LENTS],
  },
  resolve,
});
