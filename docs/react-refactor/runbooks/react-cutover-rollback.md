# React Cutover And Rollback Runbook

Status: parity-repair implementation and pre-freeze automated acceptance passed; corrected-candidate freeze, exact-tag smokes, and rollback rehearsal are pending. Production cutover is not authorized.

## Immutable Inputs

| Purpose | Ref | Peeled commit / checksum |
|---|---|---|
| legacy rollback source | `react-refactor-legacy-static-baseline` | `a78b064d65f024a301a3b179c62a458a1445bbf6` |
| R4 visual baseline | `react-refactor-r4-visual-accepted` | `55b8a123a7a5b28647c40acc81783ee37cd58302` |
| R5 start | `react-refactor-r4-closeout` | `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` |
| superseded R5 candidate | `react-refactor-r5-candidate` | `0de4972de64455a14d8c36262e58cc6af5c4875b` |
| superseded R5 candidate | `react-refactor-r5-candidate-v2` | `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90` |
| parity-repair base / superseded candidate | `react-refactor-r5-candidate-v3` | `59065730712c6d9718928fd25cba23e33455395e` |
| corrected candidate | `react-refactor-r5-parity-repair-candidate` | pending final gates and annotated-tag freeze |
| legacy built `index.html` | baseline build | SHA-256 `d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7` |
| legacy `assets+css+js` manifest | sorted per-file hashes | SHA-256 `c25907b67fb92f5aa2a4e85e7b2473331ffa6a5ed7a5f036a7ea240440a72e30` |
| corrected release artifact | exact-tag `dist/r5-release-manifest.json` | schema-2 identity and external manifest SHA-256; pending |

Always peel annotated tags with `git rev-parse <tag>^{}`. Never move or reuse an old candidate tag. The three old R5 candidates do not contain the production parity repair.

## Pre-Freeze Acceptance

From the completed implementation branch, run the full automated gate once:

```bash
pnpm run verify:all
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
```

Also run the historical harness and the hardware performance/process-memory profile required by `r5-regression-matrix.md` and `r5-performance-budget.md`. Do not capture screenshots or request manual visual acceptance for this gate.

Any failure invalidates the freeze. Fix the owning implementation and use focused diagnostics while repairing; rerun the complete gate only when the branch is again ready for a final decision.

## Corrected Candidate Freeze

Only after every pre-freeze gate passes and the worktree is clean:

```bash
git tag -a react-refactor-r5-parity-repair-candidate \
  -m "R5 production parity repair candidate"
git rev-parse react-refactor-r5-parity-repair-candidate^{}
git status --short
```

Record the peeled commit and annotated tag-object id. The tag is immutable from this point.

## Exact-Tag Build And Smokes

Use a detached, clean checkout of the exact tag with Node 22 and pnpm 8.15.1:

```bash
git switch --detach react-refactor-r5-parity-repair-candidate
corepack enable
corepack prepare pnpm@8.15.1 --activate
pnpm install --frozen-lockfile
R5_CANDIDATE_TAG=react-refactor-r5-parity-repair-candidate \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" \
pnpm run deploy:build
shasum -a 256 dist/r5-release-manifest.json
```

Only this identity-bound `dist/` is a candidate artifact. A plain `pnpm build` is validation output and must not be published.

The exact-tag smoke must cover:

- public root metadata/static copy and the shared footer/filing;
- JavaScript-disabled正文;
- canonical favicon/font emitted-byte identity;
- direct `#method`, `#services`, `#education`, and `#contact` entry;
- one key forward/reverse Pattern/Star Map ink path;
- one Figure2 reverse intermediate-frame path;
- one PH/TTG bidirectional path;
- Contact reverse without Hero current/visible;
- old standalone/harness production URLs rendering the React 404 without a legacy bootstrap.

Representative HTTP smoke:

```bash
pnpm preview --host 127.0.0.1 --port 4173
curl -fsS http://127.0.0.1:4173/ | rg '同野观幂｜AI 转型与能力建设|服务备案号 沪ICP备2024086119号-3'
curl -fsS http://127.0.0.1:4173/aod.html > /tmp/r5-repair-aod.html
curl -fsS http://127.0.0.1:4173/harness/r4-g1 > /tmp/r5-repair-harness.html
! rg 'js/main\.js|homepage-snap-runtime|Group1Harness' /tmp/r5-repair-aod.html /tmp/r5-repair-harness.html
```

Store the exact tag, peeled commit, tag object, manifest digest, emitted-file count/bytes, root verification counts, historical harness count, release-matrix count, performance/process-memory values, smoke result, and rollback result in `reports/r5-parity-repair-candidate.md` or its external immutable release record.

## Same-Port Rollback Rehearsal

Use separate clean corrected-candidate and legacy checkouts. Reuse one local port and switch the served directory in this order:

1. Corrected candidate: verify root, static footer, manifest presence, no-JS, direct hash, representative media range, and key forward/reverse smoke.
2. Stop the candidate server completely.
3. Legacy baseline: rebuild from `react-refactor-legacy-static-baseline`, verify the frozen legacy index hash, legacy title/CTA/bootstrap, HTTP 206 media range, and candidate manifest absence.
4. Stop the legacy server completely.
5. Restore the exact corrected candidate on the same port and repeat root/footer/manifest/no-JS/key-direction smokes.

Legacy regeneration:

```bash
git switch --detach react-refactor-legacy-static-baseline
node scripts/build-index.mjs
test "$(shasum -a 256 index.html | awk '{print $1}')" = \
  d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7
```

Port reuse, process termination, and artifact identity must be recorded; two simultaneously running preview servers do not constitute a rollback rehearsal.

## Production Cutover — Only After Later Explicit HITL Approval

1. Record approver, time, exact corrected tag/commit/tag object, artifact manifest hash, and rollback artifact id.
2. Merge through the approved repository process without rebuilding from another commit.
3. Publish only the identity-bound `dist/` with an atomic release switch; keep the legacy artifact addressable.
4. Run production root/no-JS/hash/input/media smokes and the agreed monitoring window.
5. Only after approved production smoke may `react-refactor-r5-cutover` be created on the deployed commit.

This repair goal stops before every step above. HITL review does not itself imply merge/deploy authorization.

## Rollback Triggers

Rollback immediately for wrong/split default runtime, missing or hidden core正文/footer/metadata, persistent loader, input/history/reading lock, blank or stale media surface, Contact recovery through Hero, LayerWindow/resource leak, TTG direction failure, or any frozen LCP/frame/bundle/GPU/RSS/heap/disposal budget breach.

## Production Rollback Procedure

1. Freeze releases and record trigger, devices/URLs, corrected tag, and manifest.
2. Atomically point production to the stored legacy artifact.
3. Verify legacy root/copy/navigation/media and that corrected assets/manifest are no longer active.
4. Invalidate only failed-candidate cache keys; never delete immutable source tags or artifacts.
5. Record recovery completion. Re-cutover requires a new candidate identity, full automated matrix, rollback rehearsal, and explicit approval.

## Archive Boundary

- Keep the legacy tag and immutable release artifact; do not duplicate the 557MB legacy asset tree in Git.
- Keep legacy runtime/build commands until the post-cutover retention period expires.
- R6 destructive cleanup remains forbidden until a separately approved cutover and reference-graph audit.
