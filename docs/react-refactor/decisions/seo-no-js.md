# ADR: SEO And No-JS Content Strategy

Status: proposed in R-1, requires HITL confirmation before R0.

## Decision

Use static prerendering for public marketing pages.

The React rewrite must ship crawlable HTML that already contains the core page copy before client JavaScript runs. JS may hydrate/enhance cinematic playback, but it must not be the only source of marketing copy.

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

## R0 Requirements

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

## Implementation Direction

R0 should select a Vite-compatible static prerender path for the marketing entry. The exact library/tooling can be decided in R0, but the artifact contract is fixed here:

```txt
dist/index.html
  contains title/meta/nav
  contains canonical section text from copy-reference.json
  loads the React/GSAP runtime as enhancement
  does not require JS for the text baseline
```

If R0 discovers that full prerendering is impractical, it must produce a new ADR before implementation and still provide a crawlable HTML shell with all copy baseline text. The shell cannot be empty placeholders.

