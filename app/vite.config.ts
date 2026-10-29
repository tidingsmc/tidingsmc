import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { build } from "esbuild";

/**
 * Serves src/sw.ts as sw.js at the app's root, so it can be registered for any scope below it.
 * Dev serves it as an ES module (registered with type: 'module'); the build bundles it into one classic script.
 */
function serviceWorker(): Plugin {
  return {
    name: "tidings-service-worker",
    configureServer(server) {
      server.middlewares.use("/sw.js", async (_req, res, next) => {
        try {
          const result = await server.transformRequest("/src/sw.ts");
          res.setHeader("content-type", "text/javascript");
          res.end(result?.code);
        } catch (err) {
          next(err);
        }
      });
    },
    async generateBundle() {
      const result = await build({
        entryPoints: ["src/sw.ts"],
        bundle: true,
        format: "iife",
        target: "es2020",
        minify: true,
        write: false,
      });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: result.outputFiles[0].text,
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  // Relative asset paths, so the build works from any folder (e.g. GitHub Pages' /tidings/).
  base: "./",
});
