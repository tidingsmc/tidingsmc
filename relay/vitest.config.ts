import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // The public half of the key test/relay.test.ts signs with.
      miniflare: {
        bindings: {
          OWNER_KEY:
            "BHuxHWJNJPHhaxHpE2uJyHn5fXuYMiPoQm1A62QE-O3iP9VQDSMHdofkBne90JNP11cSagJFY-R64JKAVZjJ2Qc",
        },
      },
    }),
  ],
});
