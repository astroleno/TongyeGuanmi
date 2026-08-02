# R5 Phone Clean Runtime — Task 12 blocker review

- Date: 2026-08-02
- Reviewer: correctness, main thread
- Branch: `codex/r5-phone-clean-runtime-convergence`
- Reviewed HEAD: `f167b9b974d8d1c86342ce5e85b6b7f6df86ed52`
- Decision: **BLOCKED / NO-GO**
- Next phase: **Task 13 is not authorized**

## Outcome

Task 12 cannot honestly be closed. The bounded diagnostic window replaced the
long Playwright loops, found and fixed the Group 4–5 first-state divergence,
and reached a 10/10 focused browser gate. The one subsequently authorized full
release run then exposed an intermittent Mobile WebKit TTG direct-entry stall.
That run was stopped at the first failure instead of consuming the remaining
152 cases.

The TTG failure-side runtime snapshot and one passing leaf-event sequence were
captured. They narrow the fault to the handoff between a spent activation and
the missing `video-decoded` prepared report, but they do not identify which
leaf guard or asynchronous settlement discarded the report. No further
production patch is justified from the available evidence.

## Blocking finding

### P1 — Mobile WebKit can spend TTG activation without accepting its decoded frame

Locations under review:

- `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- `app/src/production/phone-story/runtime.ts`
- `app/e2e/r5-ttg-alpha.spec.ts`

Observed failure:

1. The complete release suite reached 74 passed tests, then
   `mobile-webkit › r5-ttg-alpha.spec.ts › TTG decode failure hides its video
   and preserves the authored fallback` timed out during the initial
   `waitForCommitSequence`; the test had not yet injected the decode error.
   The remaining 152 tests were terminated.
2. The failure-side five-second snapshot was still a TTG boot transaction in
   `preparing`, with `activation: spent` and an active `mediaPrepare` deadline.
   Its only missing prepared requirement was `video-decoded` for
   `ttg-figure-video`.
3. At the same point, the canonical video had no media error, `readyState = 4`,
   the expected current run/generation, the endpoint playhead, and
   `timelineVideoFrameReady = true` with `video-frame-callback` evidence.
   No page or console error explained the missing report.
4. The bounded passing replay recorded the complete sequence
   `pageshow → rebind → activate → play-fulfilled → prepared(initial) →
   prepared(terminal)`, then reached stable commit 1. Its frame and report
   generation stayed aligned.

The first known wrong state is therefore not the final Playwright timeout. It
is the transaction having consumed activation while the physically decoded
TTG frame has not become the reducer-owned prepared proof. The failed run did
not retain the corresponding leaf-event array, so the evidence cannot yet
distinguish among a stale driver result, generation invalidation, binding
replacement, or another report guard. Treating any one of those as the cause
would be a guess.

Impact:

- a real direct entry can remain behind the Hero/Loader cover;
- the full dispositioned release suite is not green;
- `candidateCodeSha` cannot be frozen and Task 13 cannot start.

Required before reopening Task 12 closure:

1. Restore the test-only TTG leaf event recorder without changing production
   behavior and capture one failing Mobile WebKit run, preserving the exact
   event order before the timeout.
2. Add a deterministic RED unit/integration fixture for the specific branch
   proven by that event order, then make only that fixture green.
3. Make the focused TTG Mobile WebKit gate stable for at least 10/10 runs.
4. Re-run static gates and exactly one complete release suite. Any new first
   failure returns to a bounded focused diagnostic; it does not authorize a
   five-loop or 227-case diagnostic cycle.

## Resolved within the diagnostic window

The earlier Group 4–5 failure is root-caused rather than merely timed out:

- a retired `prepareTimelineVideoFrame()` settlement could execute its final
  `pause()` after successor playback acquired the same video;
- a retained activation retry could receive late React effect/target mounts
  through the previous generation's report ports;
- the observed media activation rejection was
  `AbortError: The play() request was interrupted by a call to pause()`.

The current uncommitted patch adds preparation ownership to the shared video
driver, permits replacement only for a detached retained mount, and rebinds
late report ports to the active generation. Deterministic regressions cover
both ownership boundaries. Group 4–5 then passed 10/10 focused Mobile WebKit
runs.

## Unified machine/runtime review

| Area | Review result |
| --- | --- |
| machine and stable commit | No Task 12 WIP change; reducer/queue/rollback tests were green in the 1,184-test Vitest run. Approval remains contingent on the release gate. |
| queue and supersede | Generation-bound late reports and retained mounts have focused coverage; no second queue or authority was introduced. |
| rollback | Existing fail-closed rollback tests remained green; the failed TTG boot had no prior stable source and correctly kept the Loader rather than publishing a false target. |
| activation | Group 4–5 abort/play ownership is proven and focused-green. TTG can still reach `activation: spent` without its prepared proof, which is the blocking boundary. |
| disposal | The video preparation owner prevents a retired promise from pausing successor playback; detached mount replacement retires and releases the old lease once. |
| presentation | The retained lease now exposes attachment state to the runtime. Focused tests cover attached/detached behavior; full release approval is withheld. |

This review finds no basis for a broader architecture rewrite. It also does not
approve the current WIP as Task 12 closure while the P1 remains.

## Verification ledger

Passed before the release rerun:

- focused machine/runtime/media tests: 144/144;
- TypeScript;
- Group 4–5 focused Mobile WebKit: 10/10;
- Node gate fixtures: 119/119;
- Vitest: 173 files / 1,184 tests;
- full build and architecture/LOC gates;
- `runtime.ts`: exactly 1,000 nonblank LOC;
- phone JavaScript: 606,523 B;
- largest lazy chunk: 50,892 B.

Release result:

- 74 passed;
- 1 failed at Mobile WebKit TTG initial commit;
- 152 did not run because the suite was intentionally terminated at the first
  new failure.

Bounded TTG replay after instrumentation removal is not claimed as closure: the
instrumented single test passed once in 6.9 seconds and preserved the passing
event chain, but did not reproduce the failure-side leaf events.

After removing every temporary diagnostic hook, the final deterministic
machine/runtime/presentation/video-driver/Figure3/TTG set passed 172/172 and
TypeScript passed again. No browser suite was started for this cleanup check.

## Evidence and repository state

Persistent ignored evidence is under:

`artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task12-blocker-review/`

Key hashes:

| Evidence | SHA-256 |
| --- | --- |
| `group45-fail-runtime.log` | `77d8321a2342710cc9abf7c9ebb17a96f192ae3e00e174bbd46c918121a1860d` |
| `group45-pass-runtime.log` | `5908483aa155b8dc776b7dafa62d21f54f77deaf7767f9b944bef042e38b18a5` |
| `group45-activation-reason.log` | `f8e965e183d1d5d5dd046662a3faceb252e186bd7b061b131d4957d00af5b6ea` |
| `group45-failure-trace/0-trace.trace` | `aefebbcd5d815468c89bc2e7c1caa971dd757acd49cdc644d5c4e31a142d46d1` |
| `ttg-pass-runtime.log` | `5df855c9ffc3e6ca74ff29e1f5062a2f5c038146f7882e096028eae3072e277b` |
| `ttg-pass-trace.zip` | `ef7be3345e2b29b4b547719b44fc38d750d88eb69a3260d75539ce49d5a7ff09` |

The test-only global/runtime and TTG diagnostic hooks were removed after the
bounded replay. The ten real production/test files remain uncommitted so they
are preserved without mislabeling them as a Task 12 acceptance commit. No
candidate tag, push, merge, or Task 13 evidence was created.
