# R5 Phone Clean Runtime — Task 12 closure review

- Date: 2026-08-03
- Reviewer: correctness, main thread
- Branch: `codex/r5-phone-clean-runtime-convergence`
- Reviewed base HEAD: `49e06fc164c0ba17c6037332be94629a8773011d`
- Superseded candidate code commit: `a4ba41feaf76fb2f40afbcf222f1565216fac648`
- Current candidate code commit: `8f3913908cba95e150d464dfab12270efe9dbdc3`
- Superseded pre-commit code-diff SHA-256: `3b40ea1c24d46e30191e6381c263b302e63267c4e2b7b4d6bc78562da0c01b5e`
- Decision: **GO — Review approved; Task 12 is `Chunk-contract-complete`**
- Subsequent status: **Task 13.1 replacement identity frozen; Task 13.2 must restart**

## Task 12 closure disposition — 2026-08-03

All Task 12 blockers are closed on the current candidate:

- the shared timeline driver again requires bounded agreement between its
  proof and the physical playhead, so an old generation cannot skip a real
  endpoint seek;
- Figure3 and TTG defer standalone retained-rebind recovery by one microtask,
  making same-stack activation the sole causal preparation owner;
- causal leaf reports trust the current driver result plus binding/generation
  identity, while retained-frame reuse keeps the stricter physical check;
- Hero's prewarm and first forward consumer share the same named driver
  generation instead of weakening generic cross-generation reuse;
- browser-local Hero → Pattern first-visual timing passed at `51.1ms` against
  the unchanged `80ms` limit;
- after Simulator invalidated the prior candidate, the corrective Figure2
  Grade A path passed 10/10, followed by one complete 227-case release run
  with 227/227 passing.

The original fourteen-file closure was superseded by a focused CSS fallback
regression/fix and a Figure2 transient-repaint regression/fix. The replacement
candidate is committed as `8f3913908cba95e150d464dfab12270efe9dbdc3`.
The canonical production-tree input for Task 13 is:

```text
candidateCodeSha input: 8f3913908cba95e150d464dfab12270efe9dbdc3
productionTreeHash:      96b664cf88e88d207596256ca3adaf6b739b11e77d5f3d2ebe60293854c895e0
```

The report branch may advance beyond the replacement candidate through
docs-only commits. None is a candidate build identity. A clean detached
candidate worktree has therefore been created at the exact code commit:

```text
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-8f39139
```

Its detached HEAD is `8f3913908cba95e150d464dfab12270efe9dbdc3`, its
working tree is clean, and its canonical production-tree hash is the value
above. Task 13 Step 13.1 must build only from that detached worktree and must
reject any manifest whose `sourceCommit` is not `8f39139…`. The current report
worktree's `dist/r5-release-manifest.json` records the documentation commit and
is explicitly non-candidate output; it must not be reused for Simulator or
physical-device evidence.

This Task 12 review did not itself assert a candidate build. Task 13.1 was
subsequently executed only in the detached candidate worktree; its exact
manifest identity is recorded in the
[Task 13 acceptance report](r5-phone-clean-runtime-acceptance.md). No iOS
Simulator, physical iPhone, deployed compression, release claim, push, or
merge is asserted here.

### Post-closure identity correction

The post-closure review found one documentation-workflow ambiguity: the old
Step 13.1 command block said only "clean worktree," so executing it from the
current docs-only HEAD would mint a release manifest with `sourceCommit =
f78e41a…`. The plan now pins the detached candidate path and requires exact
HEAD, clean-tree, production-tree, `sourceCommit`, and `sourceDirty` checks
before any Simulator or physical iPhone run. This closes the finding without
starting Task 13 or changing candidate code.

A follow-up review then reproduced a second bootstrap blocker: the new
candidate worktree contained no `node_modules`, so
`pnpm -C app exec vite --version` failed with `Command "vite" not found`.
Step 13.1 now runs
`pnpm install --frozen-lockfile` in the detached candidate worktree and repeats
the HEAD, detached-state, clean-status, and production-tree checks before the
build. That dependency bootstrap has been executed successfully from the
frozen lockfile (`258` packages reused, none downloaded); Vite now resolves as
`7.3.6`. The current replacement candidate remains detached and clean with its
updated production-tree hash. Task 13.1 built that exact candidate once and
froze its 174-file artifact/manifest identity; Task 13.2 and all physical or
deployment rows must restart from this identity.

### Simulator corrective reclosure

The first Simulator cold-root inspection invalidated `a4ba41f…`: Hero and Star
Map referenced `--portrait-readable-bottom-offset` without a fallback, so the
whole `bottom` declaration became invalid when no writer existed. A CSS
contract now requires Hero, Pattern, and Star Map to use
`var(--portrait-readable-bottom-offset, 0px)`, and focused Simulator checks
confirmed the corrected Hero cue plus Star Map portrait/landscape round-trip.

The subsequent release run exposed a separate Figure2 rollback. Reducer
diagnostics showed that a causal canvas proof had already been accepted before
a transient packed-alpha repaint miss was promoted to
`figure2-packed-alpha-render-failed`. Figure2 now uses best-effort `probe()`
for progress repaint and leaves causal frame reporting as the only proof owner.
The deterministic regression passed, the Grade A chain passed 10/10, and the
single replacement release run passed 227/227 in 28.8 minutes.

### Task 12 code correctness review

```json
{
  "reviewer": "correctness",
  "findings": [],
  "residual_risks": [
    {
      "risk": "Desktop JavaScript headroom is 4,107 B, only 11 B above the required 4,096 B reserve; any later production growth must rerun the build gate and must not relax the budget or use code-golf workarounds."
    },
    {
      "risk": "Task 12 earns Chunk-contract-complete only; Task 13 physical-device and deployed-artifact acceptance remains open."
    }
  ],
  "testing_gaps": [
    "iOS Simulator, physical iPhone Safari, and deployed compression evidence belong to Task 13 and were not run."
  ]
}
```

### Unified machine/runtime review

| Area | Closure result |
| --- | --- |
| machine / stable commit | No second reducer, stable-commit path, or semantic authority was introduced; unproved targets still fail closed to the prior stable commit. |
| queue / supersede | Runtime tests cover superseded preparation, native rejection versus abort, detached mount replacement, late-port generation rebind, and serial settlement without stale proof acceptance. |
| rollback | Rollback retains the committed source and requires a newly valid presentation plane before unlocking input. |
| activation | Figure3/TTG same-stack rebind → activate has one causal owner; stale activation/frame settlement rejects instead of fulfilling without proof. |
| disposal / resources | Mount leases, report ports, media preparation ownership, superseded playback, and final resource retirement remain generation-scoped and exception-safe. |
| presentation | Causal proof is binding/generation/endpoint scoped; retained proof still requires physical playhead agreement; toolbar/current-plane reprojection retains one reducer-owned proof source. |

### Verification ledger

- focused CSS and Figure2 regression suites: 10/10 and 9/9 passed;
- Group 7 transition regression: 16/16 passed;
- full Vitest: 174 files / 1,199 tests passed;
- Node gate fixtures: 97/97 passed;
- TypeScript, boolean-data, packed-alpha, cutover architecture, frozen-input
  diff, and `git diff --check`: passed;
- complete build: passed; desktop JS `577,525 B`, phone JS `607,259 B`,
  largest lazy JS `50,892 B`, artifact tree
  `a9586450d93e8ff4d7893e15eb51edd783379a7332d960d9260ebadeee6f9a4e`;
- corrective Figure2 Grade A focused repeat: 10/10 passed;
- complete release suite: 227/227 passed in 28.8 minutes with one worker and
  `--max-failures=1`; Hero → Pattern `51.1ms`.

The replacement full-suite command passed `--max-failures=1` directly to
Playwright and was not repeated after its 227/227 result.

### Persistent closure evidence

Evidence remains outside Git under:

`artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task12-blocker-review/`

| Evidence | SHA-256 |
| --- | --- |
| `task12-complete-story-webkit-10x-green-summary.json` | `b6f0704aefe78949c784ef66e3d592b38080ab0a6cbe97211efe026cb117759d` |
| `task12-release-green-summary.json` | `8f86e9a6a604662dc61a8a9545cda83939f97c76d5875ec8507ebfc1494e4baa` |

All 33 entries in the persistent `SHA256SUMS` manifest pass verification.

## Prior blocker disposition — superseded by the closure above

The following material is retained as the audit trail for the earlier red
candidate. Its `BLOCKED / NO-GO`, 193/227 result, and permitted-resume text are
historical and are not the current review decision.

Task 12 closure is not achieved. The earlier TTG causal-frame and Hero →
Pattern performance blockers are closed, and the newly diagnosed Figure3
activation race is fixed and stable in focused testing. The one authorized
complete release suite nevertheless produced a new first failure in the
phone-portrait WebKit complete-story traversal. The suite stopped on that
first failure as required; it was not rerun.

Current release result:

- command: `PLAYWRIGHT_PORT=4177 pnpm exec playwright test --config=playwright.release.config.ts --max-failures=1`;
- discovered: 227;
- passed: 193;
- failed: 1;
- did not run: 33;
- duration: 24.8 minutes;
- first failure: `complete story proves all 60 segment traversals through one authority without growth`;
- project: `phone-portrait-webkit`;
- failing leg: `lab → ttg-animation`;
- terminal observation: stable `lab`, `commitSequence = 20`, no visible activation CTA.

The candidate remains an uncommitted WIP. `candidateCodeSha` is still null;
no release-candidate commit, tag, push, merge, or Task 13 evidence was created.

### P1 — cumulative WebKit complete-story traversal rolls back Lab → TTG

The same candidate passed all of the following before the broad run:

- changed-file Vitest: 14 files / 229 tests;
- complete TypeScript/build/architecture/media/budget gates;
- Figure3 reverse withheld-frame WebKit: 10/10 without diagnostics;
- TTG decode-failure Mobile WebKit: 10/10;
- desktop performance: 10/10, with Hero → Pattern first visual between
  `44.4ms` and `55.5ms` against the unchanged `80ms` limit.

Inside the complete suite, both Chromium and WebKit Figure3 terminal/initial
withheld-frame checks passed, including the former test 169 blocker. The
phone-portrait Chromium 60-traversal complete-story test also passed. WebKit
then passed the focused Group 4–5 direct, cycle, delayed-chunk,
rejected-chunk, withheld-TTG, and lifecycle tests before the later cumulative
60-traversal test rolled back on `lab → ttg-animation`.

That evidence narrows the remaining blocker to state accumulated by the long
WebKit complete-story sequence. It does not yet establish whether the first
wrong event is a stale generation, activation ownership, decoder/resource
retirement, or a missing TTG causal frame report. The saved Playwright error
context contains the stable rollback state but no leaf/runtime event chain.
Changing production from this final state would therefore be speculative.

If Task 12 is resumed, the only justified next diagnostic is one focused
complete-story WebKit reproduction with the previously used test-only
runtime/TTG leaf recorder scoped to the failing `lab → ttg-animation` leg.
Capture the first wrong event and persist its trace/log before any production
change. Do not run another complete 227-case suite until a deterministic RED
fixture exists and the resulting focused complete-story gate is stable at
least 10/10.

### Figure3 activation race closed in this review

The preceding full-suite failure at the reverse withheld Figure3 frame was
not a hanging `play()` promise. A test-only browser recorder and retained
trace proved:

1. `play()` resolved and WebKit emitted `play`/`playing`;
2. the target was correctly `2.567s`;
3. paused retained rebind had already started an endpoint prime at `2.517s`;
4. synchronous activation then started a second preparation against the same
   driver generation, after which the causal waiter could remain pending until
   the reducer deadline.

The fix defers retained-rebind recovery preparation by one microtask. A
same-stack activation increments the leaf generation first and becomes the
sole causal frame owner; standalone lifecycle rebind still prepares on the
next microtask. A deterministic RED test observed two prepare calls before
the fix and exactly one after it. The original uninstrumented WebKit test then
passed 10/10 and passed again as release-suite case 169.

### Current unified machine/runtime review

| Area | Current review result |
| --- | --- |
| machine / stable commit | No new reducer or commit path was introduced. The remaining broad-run failure rolled back to the committed Lab hold rather than publishing an unproved TTG target. |
| queue / supersede | Focused runtime and leaf tests preserve generation guards; Figure3 activation now has one causal preparation owner. The long WebKit failure lacks the event chain needed to clear cumulative queue ownership. |
| rollback | Fail-closed behavior is intact, but the unexplained Lab rollback makes the complete-story release gate red. |
| activation | Figure3 rebind/activation ownership is closed. Focused TTG activation is 10/10; cumulative Lab → TTG WebKit activation/proof remains unproven. |
| disposal / resources | Focused resource-growth, context-loss, visibility, and BFCache cases passed. The cumulative complete-story failure still requires event-level evidence before disposal can be cleared. |
| presentation | Causal Figure3/TTG proof guards remain binding/generation-scoped. No false target commit was observed. |

### Current evidence

Persistent evidence remains under:

`artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task12-blocker-review/`

New audit entries:

| Evidence | SHA-256 |
| --- | --- |
| `figure3-reverse-webkit-rvfc-race-error-context.md` | `1717d0416b8cb911c0e6efeb705a878e57f43dd8d58399a833536000f72f7da5` |
| `figure3-reverse-webkit-rvfc-race-trace.zip` | `2f5e3e7487c06a929b6b947b51678b12fa52647f3e0daa09fb338d9c161fd6d9` |
| `task12-pre-release-focused-gates-summary.json` | `b2f4f831d50233a429ac3a1608afb60f09763acadd226308c4017be8a40222f5` |
| `task12-release-once-complete-story-lab-ttg-webkit-error-context.md` | `5790333004475903b752f695f61ce086be040d0b4b9c4121d955e0fa016576be` |
| `task12-release-once-summary.json` | `fd943212f2ceeae6efca76d037bd91029ddb6e6bd759c7065b691321caffa168` |

All 31 entries in the persistent `SHA256SUMS` manifest pass verification.

## Prior diagnostic record — superseded where the current disposition differs

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

The correction removed protocol time but did not make the gate stable. The
requested four-boundary browser timeline now records the runtime's subscribed
state in the same browser clock. A passing sample split `51.2ms` into
`2.3ms` keydown-to-accepted, `7.2ms` accepted-to-playing, and `41.7ms`
playing-to-first-progress-rAF. The next bounded sample failed at `100.2ms`:
the same stages were `2.4ms`, `48.6ms`, and `49.2ms`. The first material
divergence is therefore inside `preparing`, after input acceptance and before
the runtime enters `playing`; it is not Playwright dispatch or steady-state
frame pacing.

Source inspection found that the slow `48.6ms` preparation interval is close
to the video driver's `50ms` exact-endpoint prime settle path. That is a
correlation, not proof that this branch fired. No production change or budget
relaxation was made. Task 12 still cannot honestly close,
`candidateCodeSha` is not frozen, and Task 13 remains unauthorized.

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

Locations:

- `app/e2e/r5-performance.spec.ts:522`
- `app/e2e/r5-performance.spec.ts:619`
- `app/src/media/timeline-video-driver.ts:95`
- `app/src/media/timeline-video-driver.ts:506`

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
| four-stage timeline GREEN | 51.2ms | 47.0ms | pass |
| four-stage timeline bounded repeat 1 | 100.2ms | 46.9ms | fail; repeats 2–3 not run |

The failing browser-only run still had healthy Hero → Pattern steady-state
frame pacing: `16.9ms` p95, `33.3ms` max, and zero frames over `50ms`. The
measurement correction therefore confirms a cold-start-only bimodality. The
four-stage split localizes the first extra `41.4ms` to accepted input →
transition start while the runtime remains `preparing`; keydown acceptance
differs by only `0.1ms`, and the later first-progress rAF adds another `7.5ms`.
The timing resemblance to the driver's `50ms` endpoint-prime fallback is not
yet a deterministic causal proof. There is no evidence-backed production
change or basis for weakening `80ms`.

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

1. Keep the current eleven-file WIP intact; the requested browser-stage
   timeline is complete and must not become a general diagnostics framework.
2. At unit/integration level, create one deterministic RED fixture that proves
   or disproves whether the Hero start-frame generation reaches the driver's
   `50ms` exact-endpoint prime settle path despite completed adjacent prewarm.
3. Change production only if that fixture establishes the causal branch. Make
   the focused performance gate pass at least 10/10 before any broad run.
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

Fresh verification after the four-stage browser timeline:

- RED: the new Hero timeline assertion failed because the timeline was absent;
- focused GREEN: Hero `51.2ms`, with `2.3ms → 7.2ms → 41.7ms` stage splits;
- bounded repeat: Hero `100.2ms`, with `2.4ms → 48.6ms → 49.2ms` stage splits;
- the unchanged `80ms` assertion failed, and repeats 2–3 did not run after
  `--max-failures=1`;
- TypeScript and `git diff --check` passed;
- no production file and no complete release suite was run or changed in this
  diagnostic step.

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
| `browser-stage-timeline-error-context.md` | `b17c4382922cd4061bd5552b57c926894787052366f65b8ce2930e4d1b348031` |
| `browser-stage-timeline-last-run.json` | `e08ac6f13ad1ff7cb588d8817059d1fe8537745223acbefee41fbddef5381a4b` |
| `browser-stage-timeline-summary.json` | `40f60081ef8dae6782162b4ee479a4c5d9165d2caf13a47626665421f960e324` |

The test-only global/runtime and TTG leaf recorders were removed. The eleven
production/test files remain uncommitted so they are preserved without
mislabeling them as a Task 12 acceptance commit. No candidate tag, push,
merge, or Task 13 evidence was created.
