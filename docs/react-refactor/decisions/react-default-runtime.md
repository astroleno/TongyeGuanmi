# ADR: React StoryApp As The Default Runtime

Status: accepted for the R5 release candidate; production cutover awaits HITL.

Date: 2026-07-12.

## Context

R4 completed every canonical scene and transition, but `/` still rendered the R0 scaffold and root commands still favored the legacy static runtime. R5 must produce one production composition, keep harness code out of public bundles, preserve no-JS copy, and support an artifact-level rollback without maintaining two default paths.

## Decision

1. `app/src/production/StoryApp.tsx` is the single production composition root. It owns Director, Stage, LayerStore, HandleRegistry, real input, navigation/history, reduced motion, readiness/recovery and lifecycle diagnostics.
2. Root `dev`, `build`, `preview`, `test`, `lint`, `typecheck`, `ci` and `deploy:build` target the React app. The deployable directory is `dist/`.
3. Scenes and transitions are dynamic imports keyed by canonical ids. The current LayerWindow loads only prev/current/next; the next transition is prefetched at hold.
4. Harness routes are lazy and build-gated by DEV or `VITE_ENABLE_HARNESS=1`. Release builds exclude harness modules; `/harness/*` and old standalone HTML routes render the production 404.
5. A build-time static story shell supplies crawlable/no-JS copy. StoryApp is progressive enhancement and hides the shell only after a valid hydrated hold.
6. The legacy runtime has no public/default selector, query fallback or deployment path. It remains available only through the immutable baseline tag and explicit `legacy:*` commands until R6 retention expires.

## Consequences

- There is one default runtime and one release artifact, so CI/deployment cannot silently publish the legacy site.
- Initial JS no longer contains all scenes, transitions or harnesses; the R4 544,942-byte single chunk is replaced by a 344,702-byte initial chunk plus bounded lazy chunks.
- Direct hash boot loads only the target LayerWindow and preserves meaningful no-JS anchors.
- Rollback is artifact/tag replacement, not a runtime query flag. This keeps rollback fast without preserving dual-path code in production.
- R6 may delete legacy runtime and preview files only after an approved cutover, retention window and reference audit.

## Release Gate

This ADR does not authorize main cutover. The candidate must remain on `codex/react-refactor-r5-parity-cutover` until HITL approves visual rhythm, desktop/mobile behavior, TTG forward/reverse media, SEO/no-JS, performance and the rollback rehearsal. After approval, follow the runbook and establish `react-refactor-r5-cutover`.
