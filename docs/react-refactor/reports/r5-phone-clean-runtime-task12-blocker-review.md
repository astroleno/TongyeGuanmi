# R5 Phone Clean Runtime — Task 12 blocker review

- Date: 2026-08-02
- Reviewer: correctness, main thread
- Branch: `codex/r5-phone-clean-runtime-convergence`
- Reviewed base HEAD: `4be47ccbe7a5be29f379013ddeae7b3200b6301a`
- Reviewed candidate: uncommitted ten-file Task 12 WIP
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
desktop Chromium performance gate. `heroPattern` cold first visual measured
`110ms` against the frozen `80ms` maximum. The run was intentionally stopped
rather than using the remaining 196 cases as a diagnostic loop. Task 12
therefore still cannot honestly close, `candidateCodeSha` is not frozen, and
Task 13 remains unauthorized.

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

### P1 — The complete release candidate misses the frozen desktop cold-first-visual budget

Location:

- `app/e2e/r5-performance.spec.ts:725`

Observed in the only post-fix complete release rerun:

- project: `desktop-chromium`;
- test: `LCP, frame pacing, memory, GPU surfaces, and dispose stay inside R5 budgets`;
- assertion: `heroPattern cold first visual`;
- actual: `110ms`;
- required: `≤ 80ms`.

The same captured report showed healthy steady-state frame pacing
(`17.4ms` p95, `33.4ms` max, zero frames over `50ms`) and a passing
`methodFigure2` cold first visual at `65ms`. That does not waive the failed
Hero → Pattern cold-start contract. There is not enough evidence in this run
to attribute the 30ms excess to production work, the test environment, or a
specific scheduler/rendering boundary, so no additional production patch is
authorized here.

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

1. Keep the current ten-file WIP intact and do not infer a production cause
   from the terminal timeout or this single aggregate measurement.
2. Use a bounded, focused cold Hero → Pattern diagnostic to locate the first
   delayed visual state and preserve its test-only timing evidence.
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
does not convert the ten-file WIP into an accepted Task 12 candidate while the
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

The complete release rerun rebuilt the same 606,526-byte phone closure before
starting its 227 Playwright cases. It stopped at the first new blocking result
described above; no second full rerun was performed.

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

The test-only global/runtime and TTG leaf recorders were removed. The ten real
production/test files remain uncommitted so they are preserved without
mislabeling them as a Task 12 acceptance commit. No candidate tag, push,
merge, or Task 13 evidence was created.
