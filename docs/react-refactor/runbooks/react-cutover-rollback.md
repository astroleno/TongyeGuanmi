# React Cutover And Rollback Runbook

Status: candidate-ready. No step under “Production cutover” is authorized until HITL explicitly approves the R5 gate.

## Immutable Inputs

| Purpose | Ref | Peeled commit / checksum |
|---|---|---|
| legacy rollback source | `react-refactor-legacy-static-baseline` | `a78b064d65f024a301a3b179c62a458a1445bbf6` |
| R4 visual baseline | `react-refactor-r4-visual-accepted` | `55b8a123a7a5b28647c40acc81783ee37cd58302` |
| R5 start | `react-refactor-r4-closeout` | `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` |
| active R5 candidate | `react-refactor-r5-candidate-v3` | peel the annotated tag and match manifest `candidateTagObject` / `sourceCommit` |
| superseded R5 candidate | `react-refactor-r5-candidate-v2` | `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90`; manifest names the wrong candidate |
| superseded R5 candidate | `react-refactor-r5-candidate` | `0de4972de64455a14d8c36262e58cc6af5c4875b`; root G1 contract fails |
| legacy built `index.html` | baseline build | SHA-256 `d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7` |
| legacy `assets+css+js` manifest | sorted per-file hashes | SHA-256 `c25907b67fb92f5aa2a4e85e7b2473331ffa6a5ed7a5f036a7ea240440a72e30` |
| R4 clean `app/dist` manifest | sorted per-file hashes | SHA-256 `ae1ff9bcb8d7ea6228204440a1d526be3d6da482a74680873ac4052ceec0078b` |
| R5 candidate artifact | `dist/r5-release-manifest.json` | schema-2 identity plus SHA-256 stored with the immutable release artifact |

Always peel annotated tags with `git rev-parse <tag>^{}`. Do not trust an unpeeled tag-object SHA.

## Candidate Build And Verification

Run from a clean clone/worktree with Node 22 and pnpm 8.15.1:

```bash
git checkout react-refactor-r5-candidate-v3
corepack enable
corepack prepare pnpm@8.15.1 --activate
pnpm install --frozen-lockfile
R5_CANDIDATE_TAG=react-refactor-r5-candidate-v3 \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" \
pnpm run verify:all
pnpm -C app exec playwright install chrome webkit
pnpm -C app exec playwright test --config playwright.release.config.ts
pnpm -C app exec playwright test
R5_CANDIDATE_TAG=react-refactor-r5-candidate-v3 \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" \
pnpm run deploy:build
shasum -a 256 dist/r5-release-manifest.json
```

Only `dist/` produced by the strict `deploy:build` command above is deployable. A plain `pnpm build` emits an unbound validation manifest and must never be published. Preserve the bound artifact keyed by candidate tag object, source commit and manifest hash. Do not publish root `index.html`, old `js/`, preview HTML or `app/dist`.

Never substitute either superseded candidate tag: both are retained only as immutable audit records.

Pre-cutover smoke:

```bash
pnpm preview --host 127.0.0.1 --port 4173
curl -fsS http://127.0.0.1:4173/ | rg '同野观幂｜AI 转型与能力建设|约一次 AI 现场诊断'
curl -fsS http://127.0.0.1:4173/aod.html > /tmp/r5-aod-response.html
curl -fsS http://127.0.0.1:4173/harness/r4-g1 > /tmp/r5-harness-response.html
! rg 'js/main\.js|homepage-snap-runtime|Group1Harness' /tmp/r5-aod-response.html /tmp/r5-harness-response.html
```

The static preview server uses an SPA fallback, so the two `curl` checks prove that no old bootstrap is served; `r5-production.spec.ts` separately verifies the rendered React 404. In a browser, verify `/`, `/#method`, `/#services`, `/#education`, `/#contact`, menu/back navigation, one forward/reverse transition and JS-disabled正文.

## Production Cutover — Only After HITL Approval

1. Record approver, time, candidate tag/commit, artifact manifest hash and rollback artifact id in the release record.
2. Merge the reviewed candidate to `main` through the approved repository process; do not rebuild from a different commit.
3. In a clean checkout of the exact deployed commit, rerun `deploy:build` with the approved candidate tag and source commit inputs shown above; verify candidate tag object, source commit and manifest digest equal the approved artifact.
4. Publish only `dist/` with atomic release switching. Keep the previous legacy artifact addressable; do not overwrite it.
5. Run the smoke commands above against the production URL, plus a real desktop Safari, iOS Safari and Android Chrome forward/reverse check.
6. Observe error rate, media failures, LCP and navigation for the agreed watch window.
7. Only after production smoke passes, create annotated tag `react-refactor-r5-cutover` on the deployed commit and record the deployed artifact id.

## Rollback Triggers

Rollback immediately when any condition is confirmed and cannot be mitigated without changing the approved artifact:

- `/` is unavailable, publishes a wrong artifact, or old/new paths produce a split default runtime;
- title/core no-JS正文/hash anchors are missing or hidden;
- desktop/mobile input locks, history loops, or reading handoff traps the user;
- any blank frame, black flash, duplicate scene/copy, persistent loader or LayerWindow invariant breach;
- TTG forward/reverse alpha fails on an approved critical device;
- hardware LCP exceeds 2.5 s desktop/4.0 s mobile, desktop p95 exceeds 20 ms, mobile p95 exceeds 34 ms, or >50 ms frames reach 1%;
- browser-tree RSS exceeds 1.5 GB on the reference traversal, GPU process exceeds 512 MiB, or retired scene media/effect surfaces remain after 5 seconds;
- media failure cannot recover to a static endpoint and accept new input.

## Rollback Procedure

1. Freeze further releases and record trigger, timestamp, affected devices/URLs and candidate manifest.
2. Atomically point the deployment to the stored legacy artifact built from `react-refactor-legacy-static-baseline`.
3. If the artifact must be regenerated, use a clean checkout:

```bash
git checkout react-refactor-legacy-static-baseline
node scripts/build-index.mjs
test "$(shasum -a 256 index.html | awk '{print $1}')" = \
  d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7
node scripts/serve-static-site.mjs
```

4. Verify `/`, core copy, legacy navigation, representative media range requests and that React candidate assets are no longer the active release.
5. Invalidate CDN/service-worker caches only for the failed candidate keys; do not delete the immutable candidate artifact.
6. Record rollback completion, production smoke evidence and owner. Re-cutover requires a new candidate, full matrix, updated manifest and a new HITL approval.

## Archive And Assets Strategy

- Do not copy the 557,565,646-byte legacy `assets/` tree into another tracked archive directory. Git tag plus immutable release storage are the two rollback copies.
- Source `assets/` remains shared and tracked through R5. Candidate assets are content-hashed under `dist/assets/`; the release manifest validates every emitted file.
- Keep legacy root runtime, old preview HTML and `legacy:*` commands until the post-cutover retention period expires.
- R6 may remove those files only after reference-graph audit confirms no active deploy, runbook or artifact builder depends on them.
- Copy/manifest changes after candidate creation require a new artifact hash and repeat of SEO/no-JS and rollback verification.

## Ownership And Records

| Role | Responsibility |
|---|---|
| release owner | artifact identity, atomic switch, smoke and release record |
| frontend owner | StoryApp/runtime triage, device matrix and performance evidence |
| SEO owner | metadata, crawlable正文 and hash anchors |
| HITL approver | visual/mobile/TTG/SEO/performance/rollback acceptance |

Candidate and rehearsal results live in `docs/react-refactor/reports/r5-candidate.md`; machine evidence lives under `artifacts/react-refactor/r5-candidate/`.

## Rehearsal Record

The 2026-07-12 clean-environment rehearsal passed using implementation commit `469a9caf7e2530232d298635bfaf8dbc26498936`. A `--no-local` clone reproduced the candidate payload, a separate detached legacy worktree reproduced the frozen legacy index checksum, and the same port was switched candidate → legacy → candidate with root/copy/bootstrap, HTTP 206 media range and candidate-manifest presence/absence checks. Candidate v3 preserves every runtime payload hash, emits a schema-2 manifest bound to its tag object and source commit, and repeats the exact-tag root/deploy/smoke/rollback checks; see `reports/r5-candidate.md` for the release record.
