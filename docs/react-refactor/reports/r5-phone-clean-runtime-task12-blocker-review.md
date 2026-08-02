# R5 Phone Clean Runtime — Task 12 blocker review

- Date: 2026-08-02
- Reviewer: correctness, main thread
- Branch: `codex/r5-phone-clean-runtime-convergence`
- Reviewed base HEAD: `92ef4f609485af75daec6bf13fe5971038511f9f`
- Reviewed candidate: uncommitted eleven-file Task 12 WIP
- Decision: **BLOCKED / NO-GO**
- Next phase: **Task 13 is not authorized**

## Outcome

The reported Mobile WebKit TTG failure is root-caused and fixed without a
broad runtime change. A test-only leaf recorder captured the first wrong state:
the shared video driver had returned `ready` for its causal start sample while
the TTG leaf rejected the physical playhead at `0.05s`. The driver contract
accepts a `0.05s` presentation window, but TTG's initial endpoint guard allowed
only `0.04s`. The fix makes only a current, driver-owned causal start proof use
the shared driver window; retained/reusable TTG frames keep the stricter
`0.04s` test.

The deterministic regression, focused 173-test set, and Mobile WebKit TTG
gate all passed; the latter completed 10/10. All static, unit, type, build,
frozen-input, LOC, bundle, and evidence-hash gates then passed.

The one authorized complete release rerun found a new first failure in the
desktop Chromium performance gate. Its original Node-side `Date.now()` window
was invalid because it included Playwright protocol and host scheduling. That
test-only measurement is now browser-local: `performance.now()` is sampled in
the real `keydown` handler and in the first `requestAnimationFrame` observing
visual progress above `0.01`; Playwright only transports the closed result.

The correction removed protocol time but did not make the gate stable. A
single corrected probe passed at `50ms`; the bounded repeat then measured
`45.3ms` followed by `106.5ms`, failing the unchanged `80ms` budget. The third
repeat was not run after `--max-failures=1`. This is browser-side evidence, so
the old release result cannot be dismissed as only protocol jitter. Task 12
still cannot honestly close, `candidateCodeSha` is not frozen, and Task 13
remains unauthorized.

## Resolved finding

### Mobile WebKit TTG now converts its causal decoded frame into reducer-owned proof

Failure-side leaf order:

1. `mount → rebind → activate → play-fulfilled → prepare-start` remained on
   generation 1 and the current binding.
2. `prepare-settled` returned `status: ready`; the canonical video had
   `readyState = 4`, `currentTime = 0.05`, `seeking = true`, and
   `timelineVideoFrameReady = true` with `video-frame-callback` evidence.
3. The only false guard was `endpointPresented`; no `report-check` or
   `report-dispatched` event followed.
4. The runtime later reached its media-preparation deadline and correctly
   rolled the boot transaction back to Hero rather than publishing TTG without
   its required `video-decoded` proof.

This excludes stale driver settlement, generation mismatch, binding
replacement, and report acceptance as the first divergence. The mismatch was
between the driver's accepted causal sample window and the TTG leaf's narrower
initial endpoint window.

Implemented closure:

- the video driver exports its `0.05s` presentation tolerance as one shared
  contract;
- TTG uses that tolerance only for an immediately returned causal start-frame
  proof;
- TTG still requires its original `0.04s`, non-seeking predicate before
  reusing a retained endpoint frame;
- a deterministic activation-path test reproduces the Mobile WebKit
  `currentTime = 0.05`, `seeking = true`, driver-`ready` result;
- every temporary runtime/leaf diagnostic hook was removed before final gates.

## Blocking finding

### P1 — Browser-side Hero → Pattern cold first visual remains bimodal

Location:

- `app/e2e/r5-performance.spec.ts:511`
- `app/e2e/r5-performance.spec.ts:796`

The old full-suite observation was:

- project: `desktop-chromium`;
- test: `LCP, frame pacing, memory, GPU surfaces, and dispose stay inside R5 budgets`;
- assertion: `heroPattern cold first visual`;
- actual: `110ms`;
- required: `≤ 80ms`.

That `110ms` value mixed browser and host clocks and is no longer treated as a
trusted latency measurement. The corrected browser-only probes were:

| Probe | Hero → Pattern | Method → Figure2 | Result |
| --- | ---: | ---: | --- |
| single GREEN | 50.0ms | 44.7ms | pass |
| focused repeat 1 | 45.3ms | 42.3ms | pass |
| focused repeat 2 | 106.5ms | 58.4ms | fail |
| focused repeat 3 | — | — | not run after first failure |

The failing browser-only run still had healthy Hero → Pattern steady-state
frame pacing: `16.9ms` p95, `33.3ms` max, and zero frames over `50ms`. The
measurement correction therefore confirms a cold-start-only bimodality but
does not yet identify which browser-side stage consumes the extra interval.
There is no evidence-backed production change or basis for weakening `80ms`.

Release result:

- 29 passed;
- 1 failed;
- 1 next test was interrupted by the deliberate stop;
- 196 did not run;
- exit code 130 after termination.

Impact:

- the complete dispositioned release suite is not green;
- Task 12 acceptance and its release-candidate commit remain open;
- `candidateCodeSha` cannot be frozen;
- Task 13 cannot start.

Required before reopening Task 12 closure:

1. Keep the current eleven-file WIP intact and do not infer a production cause
   from the terminal timeout or aggregate frame pacing.
2. Use one bounded, test-only browser timeline to split
   `keydown → accepted input → transition start → first progress frame` and
   locate the first delayed stage.
3. Add a deterministic RED fixture only after that cause is identified, then
   make the focused performance gate stable before any broad run.
4. Re-run static gates and exactly one complete release suite. A new first
   failure returns to a bounded diagnostic; it does not authorize repeated
   227-case loops.

## Unified machine/runtime review

| Area | Review result |
| --- | --- |
| machine and stable commit | No Task 12 WIP change. Reducer, stable-commit, toolbar reprojection, rollback, and queue tests remain green. |
| queue and supersede | Late effect/target report ports bind to the active generation; stale work cannot satisfy the successor transaction. No second queue or authority was introduced. |
| rollback | TTG's failed diagnostic transaction rolled back instead of publishing an unproved target. Existing fail-closed rollback tests remain green. |
| activation | Shared video preparation ownership prevents a retired settlement from pausing successor playback. The TTG causal start frame now produces the required reducer-owned proof. |
| disposal | Detached retained mounts are retired and released before replacement; attached duplicate mounts remain rejected. |
| presentation | Mount leases expose attachment state only to the canonical runtime. Figure3/TTG causal frame acceptance stays generation- and binding-guarded. |

No correctness finding in this review requires an architecture rewrite. That
does not convert the eleven-file WIP into an accepted Task 12 candidate while the
complete release gate is red.

## Verification ledger

Passed before the release rerun:

- deterministic machine/runtime/presentation/video-driver/Figure3/TTG set:
  173/173;
- Mobile WebKit TTG focused gate: 10/10;
- Node gate fixtures required by Step 12.8: 97/97;
- Vitest: 173 files / 1,185 tests;
- TypeScript;
- complete production build and all embedded architecture/media/size gates;
- frozen-input comparison against `9652fbe`;
- `git diff --check`;
- `runtime.ts`: exactly 1,000 nonblank LOC;
- phone JavaScript: 606,526 B;
- largest lazy chunk: 50,892 B;
- persistent blocker evidence manifest: all entries pass SHA-256 verification.

Fresh verification after the test-only clock correction:

- browser-clock RED: the legacy Node window reported `359ms`, then the new
  measurement-presence assertion failed as intended;
- corrected single probe: Hero `50ms`, Method `44.7ms`, pass;
- corrected bounded repeat: one pass, one browser-side `106.5ms` Hero failure,
  third run not started;
- TypeScript;
- `git diff --check`;
- all persistent evidence hashes.

The complete release rerun rebuilt the same 606,526-byte phone closure before
starting its 227 Playwright cases. It stopped at the first new blocking result
described above. The browser-clock focused failure correctly prevented a second
full rerun.

## Evidence and repository state

Persistent ignored evidence is under:

`artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task12-blocker-review/`

Key hashes:

| Evidence | SHA-256 |
| --- | --- |
| `group45-fail-runtime.log` | `77d8321a2342710cc9abf7c9ebb17a96f192ae3e00e174bbd46c918121a1860d` |
| `group45-pass-runtime.log` | `5908483aa155b8dc776b7dafa62d21f54f77deaf7767f9b944bef042e38b18a5` |
| `group45-activation-reason.log` | `f8e965e183d1d5d5dd046662a3faceb252e186bd7b061b131d4957d00af5b6ea` |
| `ttg-pass-diagnostic-v2.json` | `553892cd7cf92ebd6e018dc107d5fd382a3f1690e5a0c48f6cb92da67e5ab2c4` |
| `ttg-pass-trace-v2.zip` | `f751edd1b7ed3799453959ded6b1653f38cec8612b8df98921f64cc792ddd085` |
| `ttg-fail-diagnostic-v2.json` | `5f1df5b774e718c61bec9aa5915587b7e65adadb1517f0c07f2a7b1b675f9802` |
| `ttg-fail-error-context-v2.md` | `e4ff402656504a5c3e01691b57b8c326969ea12974eb8ed71b51a7a98ae046be` |
| `ttg-fail-trace-v2.zip` | `9ec1fb674589c9dafc2dedf257123f556491982ea86349ce5f198119af9ff674` |
| `release-rerun-performance-error-context.md` | `3c15a0606f83cca8fd0e72f38a7332bceb5b4e2dd059fafa3fc50385f92b3cf9` |
| `release-rerun-last-run.json` | `31636499db805550b2ad7952540d26aa61ee303a328070768b4a8ca56183f4f6` |
| `release-rerun-performance-summary.json` | `a6e424ef6e3540d90f081976025c09368d2ed5998cee3d1223d06ed3d6a3f0a3` |
| `browser-clock-performance-error-context.md` | `c83ed0dc408fae7280716c29236d844264a693e41aacf12fe1e44ff5d130a91b` |
| `browser-clock-performance-last-run.json` | `9a5223409da2862421b2543af80da93eab6f91e800831e75a07084ff880fec72` |
| `browser-clock-performance-focused-summary.json` | `81a501c70d5fbc0ee70eac6368165c195323ffd6bb9eb2e373135f497825b677` |
| `ttg-mobile-webkit-10x-summary.json` | `243ecc7853bae2051ba7423ecea85a7cf7731bcaabb0417ef15394c1629931c8` |

The test-only global/runtime and TTG leaf recorders were removed. The eleven
production/test files remain uncommitted so they are preserved without
mislabeling them as a Task 12 acceptance commit. No candidate tag, push,
merge, or Task 13 evidence was created.
