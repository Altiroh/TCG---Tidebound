import { defineConfig } from "vitest/config";
import { LENTS, resolve } from "./vitest.config";

/** Les tests LENTS seuls (`npm run test:lents`) — voir `vitest.config.ts`. */
export default defineConfig({
  test: { environment: "node", include: [LENTS] },
  resolve,
});
