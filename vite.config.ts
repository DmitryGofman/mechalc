/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `--mode single` inlines all JS/CSS into one self-contained index.html that
// runs by double-click from the filesystem (no dev server, no module fetch).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  base: "./",
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
