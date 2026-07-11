# R5 SEO And No-JS Report

Status: passed.

## Artifact Contract

`app/build/static-shell.ts` runs during Vite `transformIndexHtml` and injects the accepted public copy into `dist/index.html`. The resulting document contains:

- `<html lang="zh-CN">`;
- title `同野观幂｜AI 转型与能力建设`;
- the baseline description beginning `同野观幂是一家面向组织与个人能力建设的 AI 转型咨询公司`;
- origin-relative canonical link `/`, resolved by the deployed origin;
- static navigation and ids for `#home`, `#method`, `#services`, `#education`, `#contact`;
- 8 non-legacy static sections and all 127 normalized public copy items from `copy-reference.json`;
- a scrollable, visible static body when JavaScript is disabled.

`#philosophy` is intentionally retired. Public navigation no longer promises the anchor; the accepted brand/contact material remains present, and direct `#philosophy` in the enhanced app safely resolves to hero.

## Automated Evidence

```bash
pnpm build
pnpm -C app exec playwright test --config playwright.release.config.ts --grep "no-JS"
```

Build verification:

- strips scripts/styles/comments before extracting visible text;
- checks all 127 public items exactly after whitespace normalization;
- asserts metadata, navigation hrefs and matching section ids;
- rejects R0 scaffold, legacy bootstrap/query markers and harness imports;
- emits a deterministic release manifest after the checks.

JavaScript-disabled browser verification runs on desktop Chrome, desktop WebKit, Pixel 7 Chrome and iPhone 15 WebKit. It confirms the root is empty, `[data-static-story-content=true]` is visible, required copy exists, the page scrolls beyond one viewport and no `inert`, `visibility:hidden` or `opacity:0` hides the baseline.

## Progressive Enhancement And Failure Modes

- Before StoryApp reaches a valid hold, the static shell remains available.
- On successful boot, `data-story-hydrated=true` hides the duplicate shell and exposes the single interactive Stage.
- reduced-motion uses the same static/copy contract with crossfade transitions.
- media failure enters recovery and lands on a static scene endpoint; it cannot leave the copy behind an infinite loader.
- direct no-JS hashes use real document ids; enhanced hashes map to canonical scene ids/history without relying on the legacy runtime.

Conclusion: the candidate is crawlable and its core正文 is extractable without JavaScript. Search-console/live-crawler observation after an approved deployment remains an operational HITL check, not an implementation gap.
