# R5 SEO And No-JS Report

Status: candidate-v6 artifact/static-shell verification, exact HTTP no-JS smoke, and every applicable release no-JS case passed, but v6 remains unqualified under the then-current remote-release policy because its remote workflow lost the annotated tag ref before `deploy:prepare`. Future exact-tag no-JS qualification runs locally with the release matrix and remains an external post-freeze record; GitHub Node CI is not its gate.

## Shared Source Contract

`app/src/content/site-meta.ts` is the single source for language, title, description, canonical path, company text, tagline, filing text, and filing URL. Vite and `app/build/static-shell.ts` consume that source at build time; interactive Contact consumes it through `SiteFooter`.

The generated `dist/index.html` must contain:

- `<html lang="zh-CN">`;
- title `同野观幂｜AI 转型与能力建设` and the accepted description;
- origin-relative canonical `/`;
- real anchors and ids for `#home`, `#method`, `#services`, `#education`, and `#contact`;
- all 8 non-legacy sections and 127 normalized public copy items;
- one semantic static footer with `© 上海同野观幂科技有限公司`, `AI Transformation & Capability Building`, and `服务备案号 沪ICP备2024086119号-3` linked to `https://beian.miit.gov.cn/`;
- a canonical emitted SVG favicon byte-identical to `assets/favicon.svg`, never an inline data URL;
- a canonical emitted title font byte-identical to `assets/fonts/qiji-title-subset.ttf`;
- shared `--font-title`, `--font-sans`, and `--font-traditional` tokens with readable fallback and `font-synthesis: none`;
- a visible, scrollable static body when JavaScript is disabled.

`#philosophy` remains retired. Enhanced direct entry safely resolves it to Hero; the static public navigation does not promise that anchor.

## Progressive Enhancement And Failure

- A pre-hydration loader covers cold boot, but a `<noscript>` rule removes it immediately without JavaScript.
- The enhanced loader marks its CSS fallback contract in static HTML; the production build must emit exactly one lazy loader Ink shader chunk and keep those shader markers out of the initial entry.
- The static loader remains until the React loader commits, avoiding a blank handoff; non-production harness/404 routes remove it directly.
- The static shell remains visible until StoryApp reaches a valid hold and sets `data-story-hydrated=true`.
- Loader safety/error completion cannot hide the static shell indefinitely.
- Direct hashes and no-JS ids do not rely on legacy bootstrap/query code.

## Final Automated Evidence

```bash
pnpm run verify:all
pnpm -C app exec playwright test --config playwright.release.config.ts --grep "no-JS"
```

The build verifier normalizes visible copy, asserts exactly one static footer, validates metadata/anchors, rejects legacy/harness/default-runtime markers, compares favicon/font bytes, checks the initial CSS font tokens, and rejects Inter-first drift. JavaScript-disabled browser cases run on desktop/mobile Chromium/WebKit and assert visibility, scrollability, footer/link content, and absence of hidden/inert baseline copy.

The current build verifier checked 127 copy items, 8 static sections, and 47 JavaScript files. It also verified the no-JS loader escape, loader fallback marker, one 13,534B lazy loader Ink chunk, opaque Star Map production copy, and absence of loader shader markers from the initial entry. The emitted favicon SHA-256 is `4441a740a9cb105a5fa041fbb11cd497733a490581d100667d64aba3d38b256e`; the emitted title-font SHA-256 is `bf69d2fd62129c670b741b756d2defab495074a65696ff6fd7d234211e17636b`.

Desktop/mobile Chromium/WebKit no-JS cases from candidate-v2 remain baseline history only. Candidate-v6's clean local exact-tag HTTP shell smoke and no-JS browser cases passed, but its later remote identity-setup failure prevents carry-forward. The clean exact-v7 identity smoke and final exact-tag no-JS rerun are recorded externally after freeze; no earlier qualified R5 tag contains the complete lifecycle/release/browser/CI closure.
