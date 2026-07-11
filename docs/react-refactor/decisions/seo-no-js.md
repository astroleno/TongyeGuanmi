# ADR: SEO And No-JS Content Strategy

Status: implemented in the R5 candidate. Crawlable HTML is emitted by the Vite `static-story-shell` build plugin; a client-only empty `#root` shell remains forbidden for the public entry.

Accepted for implementation: 2026-07-12. Artifact-level evidence is recorded in `docs/react-refactor/reports/r5-seo-no-js.md`.

## Decision

Use a build-time static story shell for the public marketing entry.

`app/build/static-shell.ts` serializes the accepted copy reference into `dist/index.html` during Vite build. JS hydrates/enhances cinematic playback, but is not the source of the marketing text baseline. The shell is hidden only after StoryApp reaches a valid hold and marks the document hydrated.

## Current Baseline Facts

| Fact | Evidence |
|---|---|
| Current site has crawlable static copy in `index.html`. | `scripts/build-index.mjs` expands `src/index.template.html` and `src/sections/*.html` into `index.html`. |
| Current title and description are static. | `src/index.template.html` contains `<title>` and `<meta name="description">`. |
| Current navigation uses hash anchors. | `src/partials/nav.html` links to `#method`, `#services`, `#education`, `#contact`. |
| Current JS is enhancement after HTML body content. | `index.html` includes sections before `<script type="module" src="js/main.js"></script>`. |
| Current no-JS fallback has copy but not cinematic playback. | Body text/media tags exist in build output; runtime handles transitions and smooth scroll. |

## Rejected Option

Client-only HTML shell is rejected for public routes. It would make core marketing copy dependent on JS execution and would violate `ARCHITECTURE.md` section 0: "正文文本不能只存在于 JS 运行后".

## Build Requirements

| Requirement | Verification |
|---|---|
| Public build output contains `copy-reference.json` core text before hydration. | Vitest/build text extraction against `docs/react-refactor/inventory/copy-reference.json`. |
| Static output includes title, description, canonical nav anchors, and contact CTA text. | Build artifact text/meta smoke test. |
| Browser-only APIs are guarded. | SSR/prerender smoke plus ESLint/review rule for `window`, `document`, media, and GSAP access. |
| Cinematic runtime does not execute during prerender. | SSR/prerender smoke proves no GSAP/media side effects. |
| Hash URLs remain meaningful without JS. | Static anchors or prerendered section ids for `#method`, `#services`, `#education`, `#contact`. |

## R5 Acceptance

R5 cutover cannot pass unless:

- Built app artifacts expose core copy from `copy-reference.json` in HTML without running JS.
- `title` and `description` match or intentionally supersede the current baseline.
- Public hash anchors are present and land near the intended content with JS disabled.
- Reduced-motion/no-JS path does not hide core content behind `opacity: 0`, `visibility: hidden`, `inert`, or an unremoved loader.
- Any old `#philosophy` retirement is explicit: either no public promise links to it, or the duplicate brand copy is intentionally merged into `brand`/`contact`.

## Implemented Artifact Contract

```txt
dist/index.html
  contains title/meta/nav
  contains canonical section text from copy-reference.json
  loads the React/GSAP runtime as enhancement
  does not require JS for the text baseline
```

`verify-release-build.mjs` extracts visible text from the built artifact and checks 127 non-legacy copy items across 8 static sections. JavaScript-disabled Chromium/WebKit projects verify visibility, scrolling, metadata and anchors. `#philosophy` is intentionally retired: no public navigation promises it and the duplicate material is represented in the accepted brand/contact copy.
