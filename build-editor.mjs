import { build } from "esbuild";

await build({
  entryPoints: ["web/editor-source.js"],
  outfile: "web/editor-bundle.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["safari17", "chrome120"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
});
