---
name: preview
description: Publish the current MechCalc working tree as a live, clickable Artifact the user can actually open and use — 3D viewers, drags and all. Run this at the END of every change to the app (new calculator, fix, styling tweak, math change) WITHOUT being asked, and any time the user says they want to see, open, try, preview, play with, or "actually use" the app. Screenshots are not a substitute; the user has asked to stop having to request this.
---

# Ship a live preview, every time

The user's standing request: after you change this app, they want to **use** it,
not read about it. A screenshot proves a pixel; a published Artifact lets them
grab the 3D model and drag it. Publish one at the end of the change, hand over
the link, and don't wait to be asked.

## The build already does the hard part

`npm run build:standalone` inlines every byte of JS and CSS into a single
`index.html` (that's `vite-plugin-singlefile`, wired to `--mode single`). An
Artifact is served under a strict CSP that blocks every external host, so a
self-contained page is exactly what's needed. That build also uses a relative
Vite base, which flips the router into hash mode — so every calculator stays
reachable at `…/#/shaft-calculator` on a host that knows nothing about the
app's routes.

## Steps

1. **Verify first.** `npm test && npm run build`. Never publish a preview of
   code you haven't type-checked and tested — the link is the user's first real
   contact with the change.
2. **Build and convert:**
   ```bash
   npm run build:standalone
   node scripts/artifact-page.mjs
   ```
   That writes `dist-standalone/artifact.html`: the same page with the outer
   `<!doctype>/<html>/<head>/<body>` stripped, because the Artifact host
   supplies its own.
3. **Publish** with the Artifact tool:
   - `file_path`: `dist-standalone/artifact.html`
   - `favicon`: `📐` — keep it stable across every republish of this app
   - `description`: one line naming what changed in this build
   - To update an existing preview instead of minting a new link, pass the
     previous artifact's `url` (find it with `action: "list"` if it isn't in
     this conversation). Same file path in the same session redeploys in place.
4. **Hand over the links.** Give the artifact URL *and* the deep link to the
   calculator you actually changed — `<artifact-url>#/shaft-calculator` — so
   the user lands on the thing they asked for instead of the catalog. Say in
   one line what to try (what to grab, what to watch).

## Known cosmetic difference

`styles.css` pulls Inter and JetBrains Mono from Google Fonts, and the
Artifact CSP blocks every external host — so a published preview renders in the
fallback system faces (`SF Mono`/Menlo, system-ui). Everything works; the type
just isn't the shipped type. Say so in one clause if it matters, and point at
Pages for the real thing. Don't "fix" it by inlining fonts unless asked.

## Routes

`/` catalog · `/flexure-calculator` · `/bolt-calculator` · `/beam-calculator` ·
`/buckling-calculator` · `/clamp-calculator` · `/shaft-calculator` — as hash
routes in the published build. The static prototypes under `public/designs/`
are **not** in this bundle; they are separate pages and need publishing
separately if they are what changed.

## Don't

- Don't publish a build that fails `npm test` or `tsc`.
- Don't hand over a bare screenshot and call the change delivered.
- Don't change the favicon between republishes — the user finds the tab by it.
- Don't mint a new URL for an incremental update to the same preview when the
  user already has a link they're using.

## The permanent home is still GitHub Pages

An Artifact is the instant look. Once a change is merged to `main`, the
`deploy-pages.yml` workflow ships the real site to
`https://dmitrygofman.github.io/mechalc/` (deep links like
`/mechalc/shaft-calculator` work via the `404.html` fallback). Mention that URL
when the work has been merged — the preview is for right now, Pages is the
thing that lasts.
