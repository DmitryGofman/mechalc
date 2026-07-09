/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `--mode single` inlines all JS/CSS into one self-contained index.html that
// runs by double-click from the filesystem (no dev server, no module fetch).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  // GitHub Pages serves the app under /mechalc/, and the router derives its
  // path prefix from this base. The single-file build stays relative (and the
  // router falls back to hash routes) so it keeps working from file://.
  base: mode === "single" ? "./" : "/mechalc/",
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
