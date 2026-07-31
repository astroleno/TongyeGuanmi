# ADR: R5 Task 1 Desktop Browser Gate Contradicts The Frozen Baseline

Status: accepted; test-only oracle correction verified.

Date: 2026-07-31.

## Context

Task 1 requires the complete desktop Chromium/WebKit `r5-production.spec.ts`
and `r5-matrix.spec.ts` gates to pass, while also limiting Task 1 to reviewed
rendering hunks and preserving the confirmed `9652fbe` interaction baseline.

After the Task 1 rendering changes passed 172 Vitest files / 962 tests,
TypeScript, both new verification gates, and the production build, the
desktop Chromium gate failed deterministically in four tests.

## Evidence

1. `r5-production.spec.ts:438` and `:472` require Method Top to contain zero
   `[data-reading-scrollport="true"]` elements, then expect PageDown to land on
   the retired `method-bottom` hold.
2. The frozen `9652fbe` implementation already places
   `data-reading-scrollport="true"` on Method Top. Commit `c500277` consolidated
   the Method copy/steps into that hold, retired the standalone Method Bottom
   scene loader, and kept the canonical segment as Method Top → Figure2.
3. `r5-production.spec.ts:714` still waits for a Method Top → Method Bottom
   split. PageDown remains owned by the current Method Top reading surface, so
   the obsolete receiver witness times out.
4. `r5-production.spec.ts:544` and `:627` require a wheel tail to be absorbed
   by roughly `0.65 × viewportHeight`. The frozen implementation and its unit
   test explicitly require
   `READING_WHEEL_GESTURE_BUDGET_VIEWPORT === 1.05`. At the 900 px audit
   viewport, the browser observed the expected additional capped event:
   `652 px → 814 px`.
5. The same contradictions exist at donor `82a4e68`. The current Task 1 diff
   does not modify `reading-motion-governor.ts` or either browser spec; its
   Method Top hunk only converts CSS-facing booleans to `semanticBoolean()`.
6. No reviewed neighboring-branch test fix exists: `9652fbe`, the current
   worktree, `codex/r5-phone-unit7b@be9db27`, and
   `codex/r5-phone-presentation-contract-recovery@5451d09` all contain the
   byte-identical `r5-production.spec.ts`
   (`SHA-256 5cb7a90549881a05ca36b3354c9ce4ac249fdfaba23c3e6bc08d9b9634c87c0e`).

Command and result:

```text
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-production.spec.ts e2e/r5-matrix.spec.ts \
  --project=desktop-chromium

21 passed, 7 skipped, 4 failed
```

The first failure reproduces in isolation. The two reading-budget failures
follow directly from the frozen `1.05` budget, and the Method split witness
targets a scene that the frozen production loader marks retired.

## Decision

The correctness review approved one atomic, test-only baseline-oracle
correction before completing Task 1. Preserve the `c500277` production
behavior and unit contract. Change only four stale expectations:

1. exercise the consolidated, reading-owned Method Top hold and its reverse
   entry instead of expecting the retired Method Bottom hold;
2. exhaust Figure2 Proof's `1.05 × viewportHeight` wheel budget before
   asserting that the following momentum tail is absorbed;
3. use the same frozen budget in the shared reading-scene test, while handling
   a scene whose total reading range ends before that budget;
4. witness the canonical Method Top → Figure2 ink handoff and its opaque
   receiver field instead of the retired Method Top → Method Bottom split.

Do not change production, delete coverage, or add skips or retries. The
independent correction commit contains only:

- `app/e2e/r5-production.spec.ts`;
- the authoritative convergence plan;
- this ADR.

Rejected:

- changing production back to the older Method split or `0.64` reading budget,
  because that changes the confirmed interaction baseline and touches files
  outside Task 1;
- skipping, filtering, weakening, or waiving the failed browser tests, because
  Task 1 explicitly requires both complete browser gates;
- committing Task 1 as accepted while either browser project is red.

## Frozen-baseline verification

The exact oracle patch was first applied to a detached worktree at
`b557c3e88c1b7b59fd009980f5cb6f73e53ac751`, before applying it to the Task 1
WIP. The frozen production build passed with Phone JS `628044 B` and largest
lazy chunk `55259 B`.

The complete authoritative browser commands then passed without retries:

```text
desktop-chromium: 25 passed, 7 existing project-conditional skips, 0 failed
desktop-webkit:    11 passed, 21 existing project-conditional skips, 0 failed
```

No skip was added. The differing skip totals are the suite's pre-existing
project conditions; tests limited to Chromium or mobile projects remain
intentionally undiscovered or skipped in other projects.

The identical four-oracle patch may now be applied to the Task 1 worktree.
Task 1 itself remains unaccepted until the packed-alpha, persistent Ink Canvas,
and semantic-boolean review findings are fixed and the complete Task 1
verification is green.
