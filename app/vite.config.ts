import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { build } from "esbuild";
import { execSync } from "node:child_process";

/**
 * Serves src/sw.ts as sw.js at the app's root, so it can be registered for any scope below it.
 * Dev serves it as an ES module (registered with type: 'module'); the build bundles it into one classic script
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

function gitVersion(): string {
  try {
    return execSync("git describe --tags --always", { encoding: "utf8" })
      .trim()
      .replace(/^v/, "");
  } catch {
    return "dev";
  }
}

function versionFile(version: string): Plugin {
  return {
    name: "tidings-version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version }),
      });
    },
  };
}

const version = gitVersion();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker(), versionFile(version)],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: "./",
});
