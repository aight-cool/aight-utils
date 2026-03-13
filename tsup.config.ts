import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "index.ts",
    "hooks/aight-bootstrap/handler": "hooks/aight-bootstrap/handler.ts",
  },
  format: ["esm"],
  outDir: "dist",
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  clean: true,
  noExternal: ["@sinclair/typebox"],
  external: ["openclaw", /^openclaw\//],
});
