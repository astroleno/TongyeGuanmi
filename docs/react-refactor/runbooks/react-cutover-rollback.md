# React Cutover And Rollback Runbook

Status: **R5 is pre-visual, untagged, and unqualified.** Candidate-v2 through candidate-v8 are immutable historical/unqualified records. Batch B/C are integrated; current `assets/` and `app/` excluding the non-runtime release CI contract test `app/src/production/release-manifest.test.ts` equal Batch C terminal `b62ba647cbf5402299cd0a5eef46fff152c48524`, but final manual visual review has not run. This runbook describes future freeze/qualification only; current-HEAD RSS, exact-tag smokes, rollback, browser matrices, production cutover, and deployment are not authorized or claimed.

## Immutable Inputs

| Purpose | Ref | Peeled commit / checksum |
|---|---|---|
| legacy rollback source | `react-refactor-legacy-static-baseline` | `a78b064d65f024a301a3b179c62a458a1445bbf6` |
| R4 visual baseline | `react-refactor-r4-visual-accepted` | `55b8a123a7a5b28647c40acc81783ee37cd58302` |
| R5 start | `react-refactor-r4-closeout` | `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` |
| superseded R5 candidate | `react-refactor-r5-candidate` | `0de4972de64455a14d8c36262e58cc6af5c4875b` |
| superseded R5 candidate | `react-refactor-r5-candidate-v2` | `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90` |
| parity-repair base / superseded candidate | `react-refactor-r5-candidate-v3` | `59065730712c6d9718928fd25cba23e33455395e` |
| superseded parity-repair candidate | `react-refactor-r5-parity-repair-candidate` | commit `18490690992bffef6c9705cd47438b9cd17e756a`; tag object `7f96b243d42efd3e7409ca8628109b0901900a9b` |
| rejected HITL head | branch commit | `2501704d63dbd7c150861d21a31c2d39525c23e5` |
| rejected corrected candidate | `react-refactor-r5-parity-repair-candidate-v2` | commit `0dc2a87b69af39a9a3960488fda56f6af664b54d`; tag object `c31e464215bab4ea36e1884a59ded46e8a07ce63`; immutable `NEEDS WORK` |
| failed-closed lifecycle candidate | `react-refactor-r5-parity-repair-candidate-v3` | commit `dee30b9275ecbd3b238b37dee0ea0c8cfd944427`; tag object `f08ca22736fb43bcb988b9b67404bc9fa165e422`; RSS pass, dirty-tree finalization reject |
| failed-closed browser candidate | `react-refactor-r5-parity-repair-candidate-v4` | commit `905a4ef8f7c90cb64307587e00c6ff2ee4af4d99`; tag object `e3b38639e214d0d9f07bc07595bf18a5c28faba5`; RSS/finalization/rollback pass, default E2E 42/44 |
| failed-closed release candidate | `react-refactor-r5-parity-repair-candidate-v5` | commit `a97369d1cfccff3f2e57b568714a01b42984affc`; tag object `e3761e369697802482d22394b3cd970d8851f603`; RSS/finalization/rollback/default E2E pass, release E2E 49/54 applicable |
| failed-closed CI candidate | `react-refactor-r5-parity-repair-candidate-v6` | commit `04e5c98172c90ec13a12024c5b5808bdff45e17a`; tag object `07fa7f185efcf03540e1a866a8f37794f1b849d0`; all local gates pass, remote annotated-ref setup failed |
| failed-closed review candidate | `react-refactor-r5-parity-repair-candidate-v7` | commit `d0daed5adb83fbeff7c61e0e351673fc4dea4ff5`; tag object `2f8049a3e83b393de0056287cdc16e8d79986ddf`; later review found Figure2 depth-surface and RSS sampling gaps |
| superseded parity candidate | `react-refactor-r5-parity-repair-candidate-v8` | commit `9a602e9fab2199ff2aa8753d46a25e0fc0f9d9c1`; tag object `a8a8a86adb3a8dc63220e0d045115814ad18cd7e`; later parity fixes and Batch B/C created a new source identity |
| current R5 handoff | no tag | pre-visual, untagged, unqualified; final manual visual review pending |
| review rollback build | plain build manifest | 98 files / 139,528,455B; SHA-256 `2b91f5e3cd34883125a613a2a005ff3f3a4de4db8ef7c8a317f03297ce21742a` |
| legacy built `index.html` | baseline build | SHA-256 `d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7` |
| legacy `assets+css+js` manifest | sorted per-file hashes | SHA-256 `c25907b67fb92f5aa2a4e85e7b2473331ffa6a5ed7a5f036a7ea240440a72e30` |
| historical parity-repair artifact | exact old tag `dist/r5-release-manifest.json` | schema 2; 97 files / 139,518,637B; SHA-256 `215b9beacb1932ad1194de1f8daa3d769165f33e98a11487cc185d186b1e1988` |

Always peel annotated tags with `git rev-parse <tag>^{commit}`. Never move or reuse an old candidate tag. One new candidate may be created only after final manual visual acceptance and the repeated pre-freeze gate in this runbook; candidate creation does not authorize cutover.

## Pre-Freeze Acceptance

This section is a future gate. Run it once from the completed implementation branch only after final manual visual acceptance; the current pre-visual goal does not run RSS qualification:

```bash
pnpm run verify:all
R5_BASE_URL=http://127.0.0.1:4173 pnpm -C app evidence:memory
```

Also run the focused AOD/Figure2/TTG/PH/loader/Ink paths and the hardware frame/process-memory profile required by `r5-regression-matrix.md` and `r5-performance-budget.md`. Do not capture screenshots or infer manual visual acceptance from this gate.

Any failure invalidates the freeze. Fix the owning implementation and use focused diagnostics while repairing; rerun the complete gate only when the branch is again ready for a final decision.

Candidate-v6 exact local record: source `04e5c98172c90ec13a12024c5b5808bdff45e17a`, tag object `07fa7f185efcf03540e1a866a8f37794f1b849d0`, manifest SHA-256 `095096255a98efabfc0fb00a2efe0892fbfba689102403cc31fdf2f65a291069`, memory evidence SHA-256 `c238b7be6e3f104197c899f3e2fb03986e68b389e1afc438a6be60f3aa3e2231`, and browser-tree RSS `1,495,842,816B`. Exact smokes, same-port v6 → legacy → byte-identical v6, final default E2E 44/44, and release E2E 54/54 applicable with 42 declared skips passed. Remote workflow `29227154713` then failed closed before prepare because checkout rewrote the annotated tag ref to the peeled commit, so v6 remains unqualified. This remains historical evidence only; a future candidate repeats the entire sequence and carries no v2–v8 qualification forward.

## Corrected Candidate Freeze

Only after final visual acceptance, every pre-freeze gate passes, and the worktree is clean, select one new unused versioned candidate name and create it once:

```bash
NEW_CANDIDATE_TAG='<new-unused-react-refactor-r5-parity-repair-candidate-vN>'
git tag -a "$NEW_CANDIDATE_TAG" \
  -m "R5 production parity repair candidate"
git rev-parse "${NEW_CANDIDATE_TAG}^{commit}"
git rev-parse "refs/tags/$NEW_CANDIDATE_TAG"
git status --short
git push origin "refs/tags/$NEW_CANDIDATE_TAG"
```

Record the peeled commit and annotated tag-object id. The tag is immutable from this point.

After pushing the tag, record the GitHub Actions run URL and require `Restore immutable annotated candidate tag` to pass before `deploy:prepare`. The restored local ref must be an annotated tag peeling to `github.sha`; the full identity/RSS/browser/upload workflow must finish successfully. Any remote failure invalidates the candidate even when local exact-tag evidence is green.

## Exact-Tag Build And Smokes

Use a detached, clean checkout of that exact new tag with Node 22 and pnpm 8.15.1:

```bash
git switch --detach "$NEW_CANDIDATE_TAG"
corepack enable
corepack prepare pnpm@8.15.1 --activate
pnpm install --frozen-lockfile
R5_CANDIDATE_TAG="$NEW_CANDIDATE_TAG" \
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

Before freeze, a clean detached checkout of the recorded branch commit may be used only to validate the rehearsal procedure. The final recorded rehearsal must use the exact new annotated candidate and its identity-bound artifact.

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

The 2026-07-12 review rehearsal is historical. Candidate-v6's 2026-07-13 exact-v6 → legacy → byte-identical exact-v6 rehearsal passed but cannot qualify any later source. The final run must record that port `4173` served the exact new candidate, then legacy `a78b064`, then the byte-identical new-candidate artifact; each server must be fully stopped before the next phase.

## Final E2E — Run Last

Only after exact identity-bound memory, smokes, and same-port rollback pass:

```bash
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
```

Record pass counts and project-declared skips in the external handoff. Do not edit source or release docs after these commands; any required change invalidates the frozen candidate and starts a new candidate identity.

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
