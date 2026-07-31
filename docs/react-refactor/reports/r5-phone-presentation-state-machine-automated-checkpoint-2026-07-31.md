# R5 Phone Presentation State-Machine Automated Checkpoint

> **Superseded — 2026-08-01 P0 real-root review.** The checks in this report
> forced `?v=47`, which selected the phone shell even though the production
> root build selected the desktop shell. Their DOM/state assertions therefore
> cannot establish production-phone acceptance. See
> [`r5-phone-presentation-real-root-p0-2026-08-01.md`](./r5-phone-presentation-real-root-p0-2026-08-01.md).
> The current decision is **Implementation NO-GO / Automated acceptance invalid /
> Release NO-GO**.

**Date:** 2026-07-31 (Asia/Shanghai)
**Worktree:** `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-presentation-recovery`
**Branch / automated implementation source:** `codex/r5-phone-presentation-contract-recovery` / `39c1441`

| Qualification layer | Status | Evidence / remaining gate |
| --- | --- | --- |
| State-machine and framework convergence | **GO** | Total manifest declarations are in force and compatibility fallbacks are removed. |
| Automated acceptance | **GO** | Typecheck, 1,666 tests, production build, Chromium Task 10 7/7, and WebKit Task 10 7/7 pass. |
| Release candidate | **PENDING** | An immutable annotated candidate tag and candidate-bound build have not yet been created. |
| Memory qualification | **PENDING** | Two candidate-bound process-memory runs have not yet been recorded. |
| Physical Safari | **PENDING** | No trusted physical iPhone was attached when this checkpoint ran. |
| Formal release | **NO-GO** | It remains blocked only on the release-qualification gates above. |

**Checkpoint classification:** **Implementation GO / Automated GO / Release qualification pending.**

## Scope closed by this checkpoint

`39c1441 fix(phone): retain AOD admission across renderer rebinds` closes the
WebKit-only `Method → AOD` reverse admission regression without reopening the
frozen Figure3, TTG, Group 6–7, media, or timing ledgers.

`usePhoneStageRuntime` now keeps the `front-rail` corridor and the single
`aod-method` runner alive for the route lifetime. A forwarded leaf-handle
rebind only replays the current immutable machine projection; it cannot remove
the Method reverse boundary, capability, gesture lease, or AOD transaction
owner. Missing leaves fail closed through the existing machine rollback.

The framework-level proof contract is present and exercised:

- `manifest.ts` has declared normal, reduced-motion, and direct-entry
  strategies for all 16 canonical holds and 15 canonical segments.
- `phone-composite-runner.ts` reads those total declarations through
  `phoneRunLegAdmissionTuple()` / `phoneDirectEntryAdmissionTuple()`; it has
  no opt-in `rawFrameProof`, reduced compatibility settle, or runner-created
  proof path.
- The added deterministic test proves that a `method-grade-a` corridor remount
  cannot make the existing `front-rail` reverse boundary fall back to native
  scrolling. The source gate also rejects attaching `adapterRevision` to the
  front admission lease.

## Automated evidence

All commands below used the production worktree content subsequently committed
as `39c1441`. A post-commit build reproduced the same artifact and records
that commit as its source.

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | Passed. |
| `pnpm exec vitest run` | Passed: 223 files, 1666 tests. |
| `pnpm build` | Passed, including typecheck, source/module-boundary, media, release-build, and performance-budget checks. |
| Phone JS budget | `659,416 / 663,552` bytes; `4,136` bytes headroom. This also satisfies the convergence gate `<= 659,456` by 40 bytes. |
| Chromium Task 10 | Passed: 7/7 production journeys (`phone-chromium`). |
| WebKit Task 10 | Passed: 7/7 production journeys (`phone-webkit`). |

Browser commands:

```sh
PLAYWRIGHT_PORT=4324 pnpm exec playwright test \
  --config playwright.phone.config.ts \
  --project=phone-chromium --grep 'Task 10'

PLAYWRIGHT_PORT=4325 pnpm exec playwright test \
  --config playwright.phone.config.ts \
  --project=phone-webkit --grep 'Task 10'
```

Both Playwright runs wrote `test-results/.last-run.json` with
`"status": "passed"` and no failed tests. Their seven-item matrix covers the
cold forward journey, Contact-to-Hero reverse journey, two full-motion round
trips under one authority, direct Group 6–7 reverse input, the complete
reduced-motion round trip, direct-entry/hash/menu/history behavior, and the
Brand–Lab scope cycle.

The post-commit production build reports:

```text
sourceCommit: 39c1441a0b3b0e80c45fc44bc6741d273bf5901c
phoneJsRawBytes: 659416
phoneJsHeadroomBytes: 4136
warnings: []
release-manifest qualification: pending-memory
```

## Release-qualification gates retained deliberately

No annotated candidate identity existed when this automated checkpoint was
recorded. `xcrun xctrace list devices` was also checked on 2026-07-31; it
reported the Mac and iOS simulators only, with no physical iPhone attached.
Therefore this checkpoint does **not** claim a qualified release or real
Safari/device acceptance.

Before formal release can become GO, the following remain:

1. Freeze an annotated candidate tag and produce a matching
   `release:prepare` manifest.
2. Record two passing, candidate-bound process-memory qualification runs and
   finalize the manifest as `qualified`.
3. On a physical iPhone Safari build, evidence normal and reduced
   forward/reverse traversal, including two same-authority
   cycles and direct entry.
4. On that device, exercise autoplay-blocked gesture retry, missing compositor
   frame, context loss, and
   background/foreground recovery.
5. On that device, inspect expanded/collapsed address-bar geometry,
   native-reading navigation hit
   testing, and final stable-edge inspection.

The simulator and Playwright WebKit are useful engine gates but are not a
substitute for this physical-device release matrix.
