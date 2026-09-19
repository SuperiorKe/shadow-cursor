import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });

const common = {
  bundle: true,
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
};

const contexts = await Promise.all([
  // Service worker: MV3 requires an ES module when manifest sets "type": "module".
  esbuild.context({
    ...common,
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/background.js",
    format: "esm",
    platform: "browser",
  }),
  // Content script: must be a classic script, so bundle as IIFE.
  esbuild.context({
    ...common,
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/content.js",
    format: "iife",
    platform: "browser",
  }),
  esbuild.context({
    ...common,
    entryPoints: ["src/options/index.ts"],
    outfile: "dist/options.js",
    format: "iife",
    platform: "browser",
  }),
]);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
}
