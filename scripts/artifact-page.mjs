// Turn the single-file standalone build into a page that can be published as
// a Claude Artifact.
//
// `npm run build:standalone` already inlines every byte of JS and CSS into one
// index.html — which is exactly what an Artifact needs, since a strict CSP
// blocks any request to an outside host. The one mismatch is the wrapper: the
// Artifact host supplies its own <!doctype>/<html>/<head>/<body>, so a full
// document handed to it would nest one inside another. This strips the outer
// document and keeps its contents in order — <title>, the inlined <style> and
// <script> from <head>, then the #root div from <body>.
//
// The standalone build is also the right build to publish for a second reason:
// its Vite base is relative, so the router falls back to hash routes and every
// calculator stays reachable (…/#/shaft-calculator) on a host that knows
// nothing about the app's paths.
//
//   node scripts/artifact-page.mjs [in] [out]

import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2] ?? "dist-standalone/index.html";
const outPath = process.argv[3] ?? "dist-standalone/artifact.html";

const html = readFileSync(inPath, "utf8");

const section = (tag) => {
  const open = html.match(new RegExp(`<${tag}[^>]*>`, "i"));
  const close = html.lastIndexOf(`</${tag}>`);
  if (!open || close < 0) throw new Error(`${inPath}: no <${tag}> section — is this the standalone build?`);
  return html.slice(open.index + open[0].length, close).trim();
};

// Drop the metas the Artifact wrapper sets for itself; keep everything else,
// which is where the app actually lives.
const head = section("head").replace(/^\s*<meta\b[^>]*>\s*$/gim, "").trim();
const body = section("body");

const page = `${head}\n${body}\n`;

if (!/<script/i.test(page)) throw new Error(`${inPath}: no inlined script — run npm run build:standalone first`);
if (page.length > 16 * 1024 * 1024) throw new Error(`page is ${(page.length / 1e6).toFixed(1)} MB — over the 16 MB Artifact limit`);

writeFileSync(outPath, page);
console.log(`${outPath} — ${(page.length / 1024).toFixed(0)} kB, self-contained`);
