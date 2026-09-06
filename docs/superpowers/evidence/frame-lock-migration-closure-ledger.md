# Frame-lock migration closure ledger

- Date: 2026-09-01
- Branch: `codex/frame-lock-seek-migration`
- Worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/codex-frame-lock-seek-migration`
- HEAD at freeze: `9ec3e2bbcd5137f706ba3f19f64de637981f47cb`
- Dirty tracked-diff SHA-256 at freeze: `4f35d3547fed84a293e2a0bd7798e2857347c43a37b65a30ec0d32f409bbbd72`
- Main reference: `6145cfe`; main tracked content was not modified by this
  worktree. The unrelated main-worktree untracked `.playwright-cli/` was left
  untouched.
- Status: Task 18 is open at the focused phone-portrait presentation gates; Tasks
  19–22 are not started.
- Current post-freeze status: the correctness-review follow-up has passed the
  new timer-prime, live-clock hard-release, TTG held/playing, focused sibling,
  budget, repeated WebKit, and Chromium Figure3 checks. Task 18's first full
  phone-Chromium spec cell then reproduced a Hero BFCache failure. One
  current-branch, test-only Hero diagnostic rerun also reproduced the failure
  and captured the post-pageshow media/runtime sequence. The approved A/B
  against the existing detached `9ec3e2b` baseline reproduced the same failure
  mechanism, so this is a reproducible historical baseline debt rather than a
  current-branch-only regression. The exact exemption was approved, but the
  next non-exempt focused Hero characterization failed. The approved original
  baseline triangle then timed out at its legacy playback attribute, making
  that baseline oracle unavailable. A subsequent normalized persisted-barrier
  run failed at `hero-progress` in both current repetitions and the baseline
  A/B. The second exact Hero exemption was then approved, limited to the two
  named Hero titles in the Task 18 phone-portrait Chromium/WebKit presentation
  cells. The combined exclusion was verified with `--list` as 86 tests with
  both titles absent, and E2E lint passed. The full current Chromium cell then
  stopped at the first non-exempt AOD failure after 16 passes; 69 tests did not
  run. The bounded test-only AOD timeline A/B was then run once on the current
  `9104513b` artifact and once on the detached `9ec3e2b` baseline with the same
  recorder. Both sides entered the same transaction/playing sequence and
  advanced the paused video and packed-alpha Canvas; the original sampler's
  `timelineVideoFrameReady` gate was absent on both sides, while all other
  sampling gates were satisfied. This classifies the failure as a test-oracle
  defect, not a shared-runtime regression or an AOD historical exemption. The
  test-only sampler gate was corrected without weakening the formal mapped-time
  or Canvas-advancement assertions. The baseline E2E file was restored after
  its evidence was saved. The corrected AOD focused case then passed `2/2` on
  the unchanged artifact. The subsequent 86-test Chromium presentation cell
  stopped at the first non-exempt Figure2-named test after 18 passes; 67 tests
  did not run. A bounded test-only Method native-reading characterization then
  showed that the first ArrowDown only moved the native page scroll, while the
  edge-prepared fresh ArrowDown entered Figure2 on both the current artifact
  and the detached `9ec3e2b` baseline. A corrected follow-up started the trace
  before sending the original second intent. The current artifact failed both
  focused repetitions and the baseline failed once at the same formal
  depth-mask assertion, while the trace had already advanced Figure2 media and
  the packed-alpha Canvas. The test-only mask contract was then updated to the
  direct WebP atlas contract, without changing production. E2E lint, Figure2
  midpoint `2/2`, and forward/reverse pixel-complementary siblings passed. The
  restarted 86-test Chromium presentation cell then passed 19 tests and
  stopped at the next non-exempt Figure2 conceal-pixel test; its isolation
  assertion saw a visible `<source>` descendant. The exact test failed once on
  detached `9ec3e2b` with the same result, so this was an A/B-equivalent
  test-harness isolation assertion candidate, not a current-only media
  regression. The rendered-descendant helper then passed the exact conceal
  test `2/2`. A further restarted 86-test Chromium cell passed 22 tests and
  stopped at the non-exempt Figure2 retained-arch test; the same exact title
  timed out at the corresponding wait on detached `9ec3e2b`. The retained-arch
  failure was therefore an A/B-equivalent test-harness/setup/oracle candidate,
  not an established current production regression. The missing native-edge
  setup was then added to that test, whose focused current run passed `2/2`.
  The restarted 86-test Chromium cell passed 24 tests and stopped at
  `Figure2 reverse media stage seeks from the parked endpoint to frame zero`;
  its formal Canvas time assertion received only `2.6` where it required a
  value below `.1`, and 61 tests did not run. A test-only trace then captured
  an active Canvas sequence that held at `2.6`, advanced monotonically through
  `3.3333` to `5.1667`, and ended with the retired Canvas cleared and
  `packedAlphaCompositorActive=false`. The reverse-half title and assertions
  were corrected to exclude retirement samples while preserving paused,
  no-play, and no-activation proofs; the focused case passed `2/2`. The next
  86-test Chromium cell passed 55 tests with one existing skip, then stopped
  at the non-exempt PH repeated-cycle test; 29 tests did not run. The baseline
  E2E file was restored after its evidence was saved. No WebKit/TTG cell,
  final static gate, rebuild, or commit was started after that stop.
  The PH harness then received the approved native-edge setup at all four
  Lab → PH input points, plus the existing Lab closing/last-row assertions;
  the exact PH cycle passed `2/2`, and the three PH delay/failure cases plus
  the PH visibility/BFCache lifecycle case all passed. The required
  two-Hero exclusion list still contained exactly 86 tests. The restarted
  86-test Chromium presentation cell passed 61 tests with one existing skip,
  then stopped at the first non-exempt Crane resource-growth assertion:
  `Crane slice completes Education ↔ Crane twice without resource growth`
  observed `videos=3` where the test requires `<=2`; 23 tests did not run.
  The failure artifact is
  `app/test-results/r5-phone-clean-presentatio-e9fb2-ice-without-resource-growth-phone-portrait-chromium/error-context.md`.
  This is a new stopped browser result, not a classification or permission to
  modify Crane/production code. No WebKit presentation, TTG cell, final
  static gate, rebuild, or commit was started after this stop.
  The one-run Crane characterization snapshot showed the two stable boundary
  inventories were identical across both cycles: Crane stable had 2 videos,
  2 canvases, 2 decoded videos, and 2 active decoders owned only by
  `crane-animation`; Education stable had 3 videos, 3 canvases, 3 decoded
  videos, 0 active decoders, and the four Crane owners plus the PH video and
  canvas. The temporary snapshot was saved with the failure evidence, and the
  assertion was replaced with this exact two-boundary owner contract rather
  than a `<=3` relaxation. The corrected Crane case passed `2/2`. A restarted
  86-test Chromium presentation cell then passed 68 tests with one existing
  skip, and stopped at the next non-exempt failure, `Group 6-7 direct Contact
  is resource-minimal, adjacent-prewarmed, and natively interactive`; 16 tests
  did not run. Its failure artifact is
  `app/test-results/r5-phone-clean-presentatio-3c1cf-ed-and-natively-interactive-phone-portrait-chromium/error-context.md`.
  No WebKit presentation, TTG cell, final static gate, rebuild, or commit was
  started after this stop.
  The direct Contact test was then corrected test-only: the reverse ArrowUp
  synthetic event is expected to be prevented at the native top boundary, and
  the test now records `scrollTop <= 1` before the event while requiring the
  stable `contact` state, unchanged commit sequence, and no activation/fault
  afterward. The focused case passed `2/2`. A restarted 86-test Chromium
  presentation cell then passed `69` tests with one existing skip and stopped
  at the next non-exempt case, `Group 6-7 Crane ↔ Contact commits twice with
  native input release and no growth`; its `traverseCompleteStoryLeg` wait
  timed out after the direct Contact test passed, and `15` tests did not run.
  The failure artifact is
  `app/test-results/r5-phone-clean-presentatio-ca29c-input-release-and-no-growth-phone-portrait-chromium/error-context.md`.
  No WebKit presentation, TTG cell, final static gate, rebuild, or commit was
  started after this stop.
  The approved one-run test-only fault characterization then labeled the four
  Crane ↔ Contact legs as cycle 1/2 forward/reverse and made both traversal
  waits return immediately on `status=faulted`. It reached `cycle 2 forward`,
  boundary `0`, with `status=faulted`, `faultCode=deadline:rollback`,
  `lastFailure=deadline:rollback`, `blockedBy=none`, empty `missingProof`,
  revision `475`, commit sequence `3`, and no activation surface. The runtime
  tail also contains segment generation `4` followed by rollback generation
  `5`, whose failure is `deadline:mediaPrepare`; the outer visible fault is
  still `deadline:rollback`, so the production/oracle cause is not classified.
  The fault snapshot records the current runtime tail, source/candidate/segment
  state, Crane video and canvas datasets, generations, readyState, mediaTime,
  frame, active decoder count, and resource owners in the Playwright error
  context at
  `app/test-results/r5-phone-clean-presentatio-ca29c-input-release-and-no-growth-phone-portrait-chromium/error-context.md`.
  No baseline/A-B, repeat, later Chromium cell, WebKit/TTG cell, production
  edit, rebuild, or commit was started after this diagnostic.
  The current artifact was then rerun once with the same diagnostic harness;
  it reproduced the same `cycle 2 forward`, boundary `0`, outer
  `deadline:rollback` and rollback-generation `5` `deadline:mediaPrepare`
  sequence. The approved baseline path `/private/tmp/tongye-baseline.07IidU`
  is no longer present; `git worktree list` marks its registration prunable,
  and no replacement baseline worktree was created. Baseline A/B therefore
  was pending user direction at that point.
  The user then approved recreation of the clean baseline. A detached
  `/private/tmp/tongye-baseline.6ronsn` worktree was created at the same
  `9ec3e2bbcd5137f706ba3f19f64de637981f47cb` HEAD. Only the diagnostic
  harness was ported into its E2E file; the baseline production tree remained
  unchanged. After the required baseline build passed, the exact focused test
  was run once on `phone-portrait-chromium`. It reproduced the same failure at
  `cycle 2 forward`, boundary `0`: outer `deadline:rollback`, with rollback
  generation `5` failing `deadline:mediaPrepare`, revision `475`, commit
  sequence `3`, no activation surface, and the same ready/paused Crane video
  and Canvas state. This is A/B-equivalent evidence; it does not classify the
  mechanism as an oracle defect or production regression. The baseline E2E
  file was restored without changing the index, the temporary dependency
  symlink was removed, and the detached baseline is clean. The baseline
  artifact is
  `/private/tmp/tongye-baseline.6ronsn/app/test-results/r5-phone-clean-presentatio-ca29c-input-release-and-no-growth-phone-portrait-chromium/error-context.md`.
  No repeat, later Chromium cell, WebKit/TTG cell, final static gate, rebuild,
  production edit, or commit was started after this A/B.
- Current size baseline: `phoneJsRawBytes=665514` and
  `totalJsRawBytes=665514`, both within the unchanged `665600`-byte cap with
  86 bytes of phone headroom. Earlier `666748`, `665578`, `665516`, `665559`,
  and `665436` values are historical or superseded, not current blockers.
- Current post-review dirty-diff SHA-256:
  `036fbf338de569b03918ff1a7d79ab1c7d94b2c7859b790997f5a322500c6fd2`.
  The tracked changes remain uncommitted; the main worktree's unrelated
  `.playwright-cli/` remains untouched.

This ledger is the durable freeze record required by the closure plan. It
distinguishes recoverable current-tree evidence from historical prose and does
not treat browser screenshots or an emulated device as final Task 21
certification.

## Freeze inventory

The worktree had 19 tracked modified files and four untracked files at freeze:

| Owner | Files | Disposition |
| --- | --- | --- |
| Task 18 Figure3 exact Canvas proof | `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`, `app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx`, `app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx`, `app/src/scenes/figure3-animation/phone/paper-compositor.ts`, `app/src/scenes/figure3-animation/phone/paper-compositor.test.ts` | In scope; acceptance pending |
| Task 18 TTG exact RVFC proof | `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`, `app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx`, `app/src/scenes/ttg-animation/phone/PhoneTtg.clean.test.tsx` | In scope; acceptance pending |
| Task 18 shared presenter/clock lifecycle | `app/src/media/phone-frame-lock-presenter.ts`, `app/src/media/strict-timeline-video-driver.ts`, `app/src/media/presented-frame-clock.test.ts` | In scope only where the focused receipt/lifecycle tests prove causality |
| Task 18 phone authority/activation | `app/src/production/phone-story/runtime.ts`, `app/src/production/phone-story/runtime.test.ts`, `app/src/production/phone-story/PhoneStoryShell.tsx`, `app/src/production/phone-story/PhoneStoryShell.test.tsx`, `app/src/production/phone-story/choreography.test.ts`, `app/src/production/phone-story/manifest.ts` | Shared prerequisite; causal audit required |
| Task 18 browser qualification | `app/e2e/r5-phone-clean-presentation.spec.ts`, `app/e2e/r5-ttg-alpha.spec.ts` | In scope; latest focused two-engine gate not yet complete |
| Task 18 build chunk ownership | `app/vite.config.ts` | In scope; must preserve the frozen hard budget |
| User-owned planning input | `docs/plans/2026-09-01-001-fix-frame-lock-migration-closure-plan.md` | Preserve; not a production change |
| User-owned plan/evidence inputs | `docs/plans/2026-09-01-002-frame-lock-migration-resume-execution-plan.md`, `docs/superpowers/evidence/frame-lock-migration-closure-ledger.md` | Preserve; execution plan and durable evidence |

The temporary Hero BFCache recorder was removed after the A/B evidence. The
second Hero case retains only its test-only persisted lifecycle barrier and
formal progress, frame-ready, and Loader assertions; neither changes
production code or acceptance proof. No debug bypass, native playback clock,
`seeked` receipt, `currentTime` receipt, or `rAF` receipt is accepted as strict
proof.

## Evidence tied to this tree

### Deterministic tests

Before the correctness-review follow-up, the named Task 18 Vitest command was
reproduced on the dirty tree after the Figure3 characterization change:

```text
9 files, 251 tests passed
```

That result predates the current review edits. The current review-focused
command was reproduced after the timer-prime, live-clock, and TTG held-phase
fixes:

```text
5 files, 58 tests passed
```

The earlier 251-test result is retained as historical L1 evidence; the
current 58-test result does not close the browser gate.

### Browser evidence

The earlier fresh build was used for the allowed phone-portrait WebKit
reproduction of the known Figure3 repeated-traversal failure after the bounded
prewarm change:

```text
project: phone-portrait-webkit
spec: app/e2e/r5-phone-clean-presentation.spec.ts
case: Figure3 slice commits forward and reverse twice without resource growth
result: FAIL; second cycle expected video-frame-zero, received poster-fallback
artifactTreeSha256: e5ebe27e40d5866487a3c42a3fd618ca40b625f36cf4231f9b552b100b73f86c
```

The Chromium sibling was not run because the WebKit case failed, and the
complete Task 18 Figure3/TTG focused two-engine set has not yet been run on a
final accepted tree. No two-engine green claim is made.

### Hero BFCache diagnostic rerun — 2026-09-02

The exact Hero BFCache case was rerun once on the current branch with the
existing `9104513b` artifact and a test-only recorder. No production file was
changed and the artifact was not rebuilt or overwritten:

```text
project: phone-portrait-chromium
spec: app/e2e/r5-phone-clean-presentation.spec.ts
case: stable Hero keeps Figure1 static after visibility and BFCache lifecycle recovery
result: FAIL; post-pageshow data-portrait-figure-frame remained absent and the
  page entered the retry/fault state
first observed failure code: module-load-timeout
terminal fault: deadline:mediaPrepare
attachment: app/test-results/r5-phone-clean-presentatio-1b67d--BFCache-lifecycle-recovery-phone-portrait-chromium/attachments/hero-bfcache-diagnostic-json-7143c87c23384e3a25332487ce6a2f89884d75c3.json
```

The recorder captured an initial successful Hero generation with one RVFC
callback and `data-portrait-figure-frame=ready`. Before and after the
synthetic `pagehide/pageshow`, it captured the runtime log, source/readiness,
generation, frame attributes, media calls, and lifecycle marks. After
`pageshow`, recovery entered Hero transaction generation 2 with `activation=spent`
and `phase=preparing`; the video had no source, `readyState=0`, and
`networkState=3`. The trace observed pause/load calls but no post-pageshow
`play` call, RVFC registration, or RVFC callback before the `mediaPrepare`
deadline. This is current diagnostic evidence, not yet an A/B attribution.

The approved A/B was run against the existing detached baseline at
`/private/tmp/tongye-baseline.07IidU`; no additional worktree was created. The
baseline reproduced the same mechanism, recorded below. No WebKit full cell,
TTG full spec, wide matrix, production fix, or commit is authorized before a
precise user exemption for this exact Hero case.

### Hero BFCache A/B baseline — 2026-09-02

The existing isolated baseline was used exactly as approved:

```text
worktree: /private/tmp/tongye-baseline.07IidU
HEAD: 9ec3e2bbcd5137f706ba3f19f64de637981f47cb
production changes: none; only the target E2E test received the test-only
  recorder and current Hero frame assertion
project: phone-portrait-chromium
spec: app/e2e/r5-phone-clean-presentation.spec.ts
case: stable Hero keeps Figure1 static after visibility and BFCache lifecycle recovery
result: FAIL; post-pageshow data-portrait-figure-frame remained absent
```

The baseline build passed its unchanged budget and produced:

```text
phoneJsRawBytes: 664251 B <= 665600 B
totalJsRawBytes: 664251 B <= 665600 B
desktopJsRawBytes: 575968 B <= 581632 B
phoneJsHeadroomBytes: 1349 B
desktopJsHeadroomBytes: 5664 B
artifactTreeSha256: 4ff0595357259bf8049a1e26820477635d17d950331b7fe92f36c469d9130bea
```

The complete baseline diagnostic is attached at
`/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-1b67d--BFCache-lifecycle-recovery-phone-portrait-chromium/attachments/hero-bfcache-diagnostic-json-dd8a53eb94f577fff14e9829e402e80cb156c512.json`
(`641209` bytes, SHA-256
`444aa94f3ac90e19a43e458971393e5ff98d17270d3c30e97ae5cfe61ba4715a`).
It has the same decisive sequence as the current `9104513b` diagnostic:
initial generation 1 has one successful RVFC callback; after synthetic
`pagehide/pageshow`, recovery enters generation 2 with `activation=spent` and
`phase=preparing`; there is no post-pageshow `play`, RVFC registration, or RVFC
callback; and the page ends in `deadline:mediaPrepare` with no Hero frame
proof. Both diagnostics report the early `module-load-timeout` as the first
observed marker, but the terminal failure is `deadline:mediaPrepare`.

This A/B therefore classifies the Hero BFCache failure as reproducible
historical baseline debt. Stop here and request explicit, precise approval to
exclude this exact case before resuming any later Task 18 cell. Do not weaken
the assertion, modify production, or claim the first cell green.

### Task 18 acceptance exclusion attempt — 2026-09-02 (stopped)

The temporary Hero recorder was removed and the formal
`data-portrait-figure-frame=ready` assertion was retained. The first Chromium
presentation command was then attempted with the exact-title exclusion, but
the option was placed after the positional spec path and Playwright did not
exclude the title. The exempt Hero test still ran and failed; the next,
non-exempt test `Hero lifecycle recovery completes an in-flight entrance
without replaying Loader` also failed (`data-hero-progress` remained `0.0043`
instead of `1.0000`). The run was stopped immediately; this is not an
acceptance result.

No WebKit presentation cell or TTG cell was started after that failure. A
correctly ordered exclusion command may be considered only after this stop is
reviewed; no production fix or scope expansion is implied.

### Filtering validation and second Hero characterization — 2026-09-02 (stopped)

The corrected command ordering was validated with `--list` before the focused
run. Using the exact Hero title text as `--grep-invert` produced `87 tests in 1
file`; the exempt title was absent and the second Hero case appeared exactly
once. The focused second-case command then ran one test and failed:

```text
project: phone-portrait-chromium
case: Hero lifecycle recovery completes an in-flight entrance without replaying Loader
result: FAIL; data-hero-progress remained 0.0036 instead of 1.0000
location: app/e2e/r5-phone-clean-presentation.spec.ts:2667
```

This is a non-exempt failure, so execution stopped immediately. No full
Chromium presentation rerun, WebKit presentation cell, TTG cell, final
deterministic suite, typecheck, or build was started after it. The failure is
recorded at
`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/codex-frame-lock-seek-migration/app/test-results/r5-phone-clean-presentatio-4a8dd-ce-without-replaying-Loader-phone-portrait-chromium/error-context.md`.

### Baseline triangle — original second-use-case harness — 2026-09-02 (stopped)

The existing detached baseline was run once without changing its original
second test or rebuilding its artifact:

```text
worktree: /private/tmp/tongye-baseline.07IidU
HEAD: 9ec3e2bbcd5137f706ba3f19f64de637981f47cb
project: phone-portrait-chromium
case: Hero lifecycle recovery completes an in-flight entrance without replaying Loader
result: FAIL at the original wait for data-phone-figure-playback="paused"
timeout: 5000 ms; attribute remained absent
location: e2e/r5-phone-clean-presentation.spec.ts:3068
```

Because the original baseline timed out at the legacy playback attribute, its
oracle is unavailable. Per the approved triangle rules, the `video.paused`
baseline variant was not run. This cannot justify any additional exemption or
production change. The baseline failure is recorded at
`/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-4a8dd-ce-without-replaying-Loader-phone-portrait-chromium/error-context.md`.

### Unified lifecycle barrier characterization — 2026-09-02 (stopped)

The current second test was changed only in test code to initialize
`__r5PhoneRuntimeLog` and wait for a runtime entry with
`visibility === "persisted"`; the formal progress, frame-ready, and Loader
assertions were retained. On the unchanged `9104513b` artifact, the focused
case was run with `repeat-each=2`. The persisted barrier passed in both runs,
but the formal progress assertion failed in both:

```text
current phone-portrait-chromium, repeat 1: data-hero-progress 0.0041 != 1.0000
current phone-portrait-chromium, repeat 2: data-hero-progress 0.0042 != 1.0000
```

Because progress still failed, the same normalized barrier was applied to the
second test in the existing detached `9ec3e2b` baseline without rebuilding.
That one run also reached the progress assertion and failed with
`data-hero-progress=0.0033` instead of `1.0000`. Both sides therefore fail
before frame-ready or Loader assertions under the normalized harness. This is
evidence for a second precise Hero lifecycle debt candidate, not permission to
broaden the first BFCache exemption. No full presentation cell or other cell
was started.

The second exact Hero exemption was subsequently approved for that title only,
alongside the first exact exemption, in the Task 18 phone-portrait
Chromium/WebKit presentation cells. The persisted barrier and formal
progress/frame/Loader assertions remain in the test for the later Hero owner.

### Task 18 presentation acceptance after two exact Hero exclusions — 2026-09-02 (stopped)

The two approved Hero exclusions were combined by exact title with
`--grep-invert`. The required list check passed:

```text
command: pnpm exec playwright test --config playwright.release.config.ts \
  --project=phone-portrait-chromium \
  --grep-invert "stable Hero keeps Figure1 static after visibility and BFCache lifecycle recovery|Hero lifecycle recovery completes an in-flight entrance without replaying Loader" \
  --list e2e/r5-phone-clean-presentation.spec.ts
result: Total: 86 tests in 1 file; both excluded Hero titles absent
```

The E2E lint check also passed:

```text
pnpm exec eslint e2e/r5-phone-clean-presentation.spec.ts
```

The current `9104513b` artifact was then used without rebuilding:

```text
command: pnpm exec playwright test --config playwright.release.config.ts \
  --project=phone-portrait-chromium \
  --grep-invert "stable Hero keeps Figure1 static after visibility and BFCache lifecycle recovery|Hero lifecycle recovery completes an in-flight entrance without replaying Loader" \
  --max-failures=1 e2e/r5-phone-clean-presentation.spec.ts
result: FAIL; 16 passed, then the non-exempt AOD test failed, 69 did not run
```

The stopped test was `AOD only advances its packed-alpha source after its
outgoing trusted input` at
`app/e2e/r5-phone-clean-presentation.spec.ts:2849`. Its diagnostic reported
`currentTime=0`, `paused=true`, `activation=false`, `method-top`, commit
sequence `2`, and an inactive packed-alpha canvas (`generation=1`), causing
the `AOD source playback did not advance` wait to fail. The full error context
is retained at
`app/test-results/r5-phone-clean-presentatio-6095d--its-outgoing-trusted-input-phone-portrait-chromium/error-context.md`.

This is a current non-exempt browser failure. Per the approved stop rule, no
automatic AOD fix, exemption expansion, WebKit presentation cell, TTG cell,
final deterministic suite, typecheck, build, or commit was started.

### AOD production A/B — 2026-09-02 (terminal-state observation superseded)

The AOD title was first run on the unchanged current `9104513b` artifact with
`repeat-each=2`. Both repetitions failed at the outgoing-input playback wait:

```text
current phone-portrait-chromium, repeat 1: FAIL; currentTime=0, paused=true,
  activation=false, scene=method-top, packed-alpha canvas generation=1,
  compositorActive=false
current phone-portrait-chromium, repeat 2: FAIL; same observed state
```

Because the current run failed, the same title was then run once on the
existing detached `9ec3e2b` baseline without rebuilding. It failed at the
corresponding wait, but its terminal state was different:

```text
baseline phone-portrait-chromium, repeat 1: FAIL; activation=false,
  scene=method-top, video=null, canvas=null
```

This terminal-state difference was not treated as a causal classification.
The approved test-only timeline characterization below supersedes it for
attribution; it shows that both sides actually entered playback and advanced
the same media path.

Current error contexts are retained at
`app/test-results/r5-phone-clean-presentatio-6095d--its-outgoing-trusted-input-phone-portrait-chromium/error-context.md`
and
`app/test-results/r5-phone-clean-presentatio-6095d--its-outgoing-trusted-input-phone-portrait-chromium-repeat1/error-context.md`.
The baseline error context is retained at
`/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-6095d--its-outgoing-trusted-input-phone-portrait-chromium/error-context.md`.

### AOD test-only timeline characterization — 2026-09-02 (completed; test-oracle defect)

The same test-only recorder was installed in the current and baseline AOD
test, with no production change and no rebuild. The current `9104513b` artifact
was run once and the detached `9ec3e2b` baseline was run once. Both diagnostics
captured the four requested marks in the same order:

```text
input-before: stable / aod-animation / commit=1
input-after:  transaction / preparing / source=aod-animation / candidate=method-top
playing:       transaction / playing / source=aod-animation / candidate=method-top
stable-commit: stable / method-top / commit=2
```

Both sides recorded `activation=false`, one RVFC registration and callback,
one `play` call, 78 `currentTime` writes, 77 `seeking`/`seeked` pairs, and
packed-alpha Canvas frame/media-time advancement from `0` through
`2.5667`. The current trace had 646 states and the baseline 645; each had 156
playing states, 154 states with positive video time, and 153 states satisfying
all non-timeline sampler gates. The original `samples` array was empty on both
sides because `data-timeline-video-frame-ready` was never present (`0` state
observations and `0` attribute events), while `data-phone-aod-playback-frame`
and `data-packed-alpha-frame-ready` were present during playback. The AOD page
did not expose entries through `__r5PhoneRuntimeLog` (`runtimeLog=[]` in both
files); the recorder's per-frame state snapshots captured the same runtime
status, phase, source/candidate, activation, progress, and commit sequence.

The only observed media-lifecycle divergence was after the stable
`method-top` commit: the current trace retained its original AOD media nodes
until teardown, while the baseline retired them and briefly created/retired
detached replacement nodes. It did not occur before or during the shared
playing/Canvas-advancement sequence, so the earlier baseline `video=null` /
`canvas=null` terminal observation is normal post-submit retirement evidence,
not proof of a different playback mechanism.

This classifies the red result as the third approved category: a test-oracle
defect in the stale `timelineVideoFrameReady` sampling prerequisite. The
current E2E sampler was corrected only by removing that prerequisite. The
formal `currentTime` advancement, packed-alpha Canvas advancement, mapped-time
error bound, final `method-top` commit, and no-active-activation assertions
remain unchanged. No AOD historical exemption was used and no shared-runtime
regression was established.

The current characterization JSON was written under the same Playwright result
path later reused by the approved AOD `repeat-each=2` verification. The
retained current JSON is therefore the latest green sampler verification
(7,121,420 bytes, SHA-256
`b57bcc2522faed23fe17ccabefb11023014e4f231169b6ecc73e106ffe679614`), with
the same four marks, 222 states, 4,342 events, and 3 collected samples, at
`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/codex-frame-lock-seek-migration/app/test-results/r5-phone-clean-presentatio-6095d--its-outgoing-trusted-input-phone-portrait-chromium/aod-outgoing-diagnostic.json`.
The original current-side characterization counts and full event summary are
preserved above in this ledger; its superseded 8,486,737-byte JSON was not
retained separately by Playwright.
Baseline diagnostic JSON (7,942,685 bytes, SHA-256
`835fcf5529e047156fd82caeab8a3684e0e7f30819692d95922fc8af4f2cb26b`) is at
`/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-6095d--its-outgoing-trusted-input-phone-portrait-chromium/aod-outgoing-diagnostic.json`.
The baseline E2E file was restored after these files were saved; its only
remaining worktree entry is the pre-existing `app/node_modules` symlink.

### Task 18 Chromium presentation after AOD oracle correction — 2026-09-02 (stopped)

The corrected AOD test was first run independently on the unchanged `9104513b`
artifact with `repeat-each=2` and passed both repetitions:

```text
project: phone-portrait-chromium
case: AOD only advances its packed-alpha source after its outgoing trusted input
result: 2 passed (17.1s)
```

The full Chromium presentation cell was then run with the two approved exact
Hero-title exclusions and `--max-failures=1`. Playwright confirmed `Running 86
tests using 1 worker`. The first 18 tests passed, including the corrected AOD
case; the 19th non-exempt test failed:

```text
case: Figure2 staged media holds its midpoint during the real z-depth leg
result: FAIL; 30s waitForCommitSequence timeout
spec: app/e2e/r5-phone-clean-presentation.spec.ts:3407
first failing wait: app/e2e/r5-phone-clean-assertions.ts:1094
summary: 18 passed, 1 failed, 67 did not run
```

The failure was observed at `/#method` with a stable `method-top` shell at
commit sequence `1`, no active activation, and both AOD/Figure2 videos paused
and decoded; no runtime-tail entries were reported. It was recorded
provisionally as the first non-exempt failure, then superseded by the bounded
Method native-reading characterization below. Per the stop rule, no automatic
fix, filter expansion, WebKit presentation cell, TTG cell, final deterministic
suite, typecheck, build, or commit was started from this observation.
The error context is retained at
`app/test-results/r5-phone-clean-presentatio-6a749-during-the-real-z-depth-leg-phone-portrait-chromium/error-context.md`.

### Figure2 Method handoff characterization — 2026-09-02 (superseded)

The first normalized characterization correctly established the Method setup
problem: the first ArrowDown moved only native page scroll, and an
edge-prepared fresh ArrowDown entered Figure2 on both the current `9104513b`
artifact and detached baseline `9ec3e2b`. Its post-entry trace accidentally
omitted the original second `sendFrontIntent()`, however, so the resulting
`currentTime=0`/paused/empty-Canvas state was an idle state and not evidence of
a missing Figure2 native-reading edge. That partial characterization is
superseded by the corrected trace below.

### Figure2 z-depth trace after restoring the second intent — 2026-09-02 (superseded by atlas oracle update)

The trace was changed to a `tracePromise`, started before the original second
`sendFrontIntent(page, 'forward')`, and awaited only after that intent. No
production file was changed and no rebuild was performed.

The unchanged current `9104513b` artifact was run with `repeat-each=2`:

```text
project: phone-portrait-chromium
case: Figure2 staged media holds its midpoint during the real z-depth leg
result: 2 failed; both at expectComplementaryFigure2ProofDepth
first failure: expected maskImage to contain "depth-threshold-conceal"
              received url(".../figure2-depth-mask-atlas-C1AuVG.webp")
```

The same normalized harness was then run once on detached baseline `9ec3e2b`:

```text
project: phone-portrait-chromium
case: Figure2 staged media holds its midpoint during the real z-depth leg
result: 1 failed; same expectComplementaryFigure2ProofDepth assertion
```

All three traces reached the actual Figure2 z-depth leg. They collected 381,
382, and 381 frame samples respectively; their terminal evidence showed
`figure2-animation`/`playing`, `currentTime=2.6`, `paused=true`, and packed-
alpha Canvas `mediaTime=2.6`. The source and receiver both had the atlas URL,
the expected `conceal`/`reveal` polarities, matching mask runs and progress.
The current and baseline first failure was the stale symbolic `maskImage`
expectation, not a missing second intent, media non-advancement, or
shared-runtime-only regression. The symbolic expectation was subsequently
replaced by the direct WebP atlas contract below. No Figure2 exemption was
added.

The evidence is retained at:

- Current repetition 1: `app/test-results/r5-phone-clean-presentatio-6a749-during-the-real-z-depth-leg-phone-portrait-chromium/figure2-native-reading-edge-diagnostic.json` (6,571 bytes, SHA-256 `e20d004a2dd1fe47e74dd9eac064a22b5d22d3370bed77306fd473923b3a58b5`)
- Current repetition 2: `app/test-results/r5-phone-clean-presentatio-6a749-during-the-real-z-depth-leg-phone-portrait-chromium-repeat1/figure2-native-reading-edge-diagnostic.json` (6,559 bytes, SHA-256 `fefc7eb0876d4d6aee40b02edf888503ae21db9bdc6e37bb20dd2ee40556ea0e`)
- Baseline: `/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-6a749-during-the-real-z-depth-leg-phone-portrait-chromium/figure2-native-reading-edge-diagnostic.json` (6,567 bytes, SHA-256 `a45b5d186cda0d3b83f94a1f4f2117c0145c5896ffde13109afb7b04c22dc225`)

The baseline temporary E2E edit was restored; its only remaining worktree entry
is the pre-existing `app/node_modules` symlink. Per the stop condition, no full
Chromium rerun, WebKit/TTG cell, production change, rebuild, or commit was
started after this evidence.

### Figure2 WebP atlas mask oracle and Chromium presentation — 2026-09-02 (superseded by rendered-descendant isolation fix)

The stale SVG-fragment mask expectation was replaced in test code with the
formal atlas contract: reveal and conceal share the same
`figure2-depth-mask-atlas*.webp` URL without a `#` fragment; mask sizes are
identical valid pixel dimensions; mask positions differ; both planes use
`no-repeat` and `alpha`; polarity is opposite; run/progress match; and source
and receiver rectangles match. The frame recorder was extended only to capture
computed mask positions. The AOD and Figure2 temporary diagnostic recorders
were removed; the AOD sampler correction, Method native-edge setup, and
formal `recordPhoneStoryFrames` trace were retained. No production file or
build artifact changed.

E2E lint passed. The Figure2 midpoint focused case passed twice, followed by
both pixel-complementary siblings:

```text
Figure2 staged media holds its midpoint during the real z-depth leg: 2 passed
Figure2 forward fixed-plane masks stay pixel-complementary: passed
Figure2 reverse fixed-plane masks stay pixel-complementary: passed
```

The 86-test `phone-portrait-chromium` presentation cell was then restarted
with only the two approved exact Hero-title exclusions and
`--max-failures=1`. It ran 86 tests, passed the first 19, and initially
stopped at:

```text
case: Figure2 conceal mask removes source pixels during the Proof reveal
result: FAIL; 19 passed, 1 failed, 66 did not run
first failure: captureDepthPlaneAlpha isolation assertion
expected visibleDescendants=[]
received the Figure2 <source> element for figure2-pair-motion
```

The same exact test was run once on detached baseline `9ec3e2b` and failed at
the same isolation assertion. The test-only helper was then corrected to
count only rendered descendants with visible styles and a non-zero client
rect. The exact conceal-pixel case passed `2/2` on the unchanged artifact,
so the earlier isolation observation is closed as a test-only oracle defect.
The full-cell result after that correction is recorded below.

The current full-cell error context is at
`app/test-results/r5-phone-clean-presentatio-1e116-els-during-the-Proof-reveal-phone-portrait-chromium/error-context.md`.
The baseline A/B error context is at
`/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-1e116-els-during-the-Proof-reveal-phone-portrait-chromium/error-context.md`.
The baseline E2E file was restored; its only remaining worktree entry is the
pre-existing `app/node_modules` symlink.

### Figure2 rendered-descendant isolation, retained arch, and reverse endpoint — 2026-09-02 (stopped)

The conceal-pixel isolation helper in
`app/e2e/r5-phone-clean-presentation.spec.ts` was changed from
`visibleDescendants` to `renderedDescendants`. It now requires visible
computed styles and at least one `getClientRects()` rectangle with non-zero
width and height, so media `<source>` metadata is not treated as a rendered
descendant. The white active-plane/black-background isolation remains, as
does the unchanged `changedScreenshotPixels(...).toBeGreaterThan(5_000)`
proof. No production file or build artifact changed.

The corrected exact conceal-pixel case passed twice:

```text
project: phone-portrait-chromium
case: Figure2 conceal mask removes source pixels during the Proof reveal
result: 2 passed (20.8s)
```

The first restarted 86-test `phone-portrait-chromium` presentation cell used
only the two approved exact Hero-title exclusions and `--max-failures=1`.
It passed 22 tests and stopped at the retained-arch setup wait. The
test-only setup was then corrected by adding
`prepareCompleteStoryNativeEdge(page, 'method-top', 'forward')` before the
fresh input. The exact retained-arch case passed twice:

```text
case: Figure2 retained arch enters with the target boundary and survives commit
result: 2 passed (8.9s)
```

The first restarted 86-test Chromium presentation cell then passed 24 tests
and stopped at:

```text
case: Figure2 reverse media stage seeks from the parked endpoint to frame zero
result: FAIL; 24 passed, 1 failed, 61 did not run
first failure: formal Canvas media-time assertion expected a value < .1,
received 2.6
```

This old physical-time assertion was then characterized with a test-only
Canvas/media trace. The active Canvas contained 314 samples: it held at
`2.6`, then advanced through `3.3333` to `5.1667` while
`packedAlphaCompositorActive` was `true`; the final retired sample had a
cleared `mediaTime` and `packedAlphaCompositorActive=false`. The video trace
also advanced from `2.6` through `5.1667`; its final `0` sample had
`readyState=0` after source retirement. The diagnostic attachment is at
`app/test-results/r5-phone-clean-presentatio-c8415-rked-endpoint-to-frame-zero-phone-portrait-chromium/attachments/figure2-reverse-media-diagnostic-json-21c610c4f0dc5552713e5cbe0237166e2aa7e08f.json`.

The title and assertions were corrected to describe the authored reverse half
and to exclude samples after Canvas retirement, while retaining paused,
`playCount === 0`, no-activation, and real Canvas advancement proofs. The
temporary diagnostic output was removed after the evidence was captured. The
corrected focused case passed `2/2`.

The restarted 86-test Chromium presentation cell then passed 55 tests, had
one existing skipped test, and stopped at:

```text
case: PH slice completes Lab → PH → Education forward/reverse twice without growth
result: FAIL; 55 passed, 1 skipped, 1 failed, 29 did not run
first failure: completePhSliceAttempt timed out after 10s waiting for the
expected PH ink segment
```

This is a new non-exempt browser failure and remains unclassified. Per the
approved stop rule, no baseline rerun, production change, WebKit/TTG cell, or
further Task 18 browser cell was started.

The current retained-arch A/B error context is at
`app/test-results/r5-phone-clean-presentatio-43393-oundary-and-survives-commit-phone-portrait-chromium/error-context.md`.
The current reverse-media full-cell error context is at
`app/test-results/r5-phone-clean-presentatio-c8415-rked-endpoint-to-frame-zero-phone-portrait-chromium/error-context.md`.
The current PH repeated-cycle full-cell error context is at
`app/test-results/r5-phone-clean-presentatio-9fc5c-everse-twice-without-growth-phone-portrait-chromium/error-context.md`.
The earlier baseline A/B error context is at
`/private/tmp/tongye-baseline.07IidU/app/test-results/r5-phone-clean-presentatio-43393-oundary-and-survives-commit-phone-portrait-chromium/error-context.md`.
The baseline E2E file was restored; its only remaining worktree entry is the
pre-existing `app/node_modules` symlink.

### Build and budget evidence

The current dirty tree completed TypeScript compilation, contract checks,
media checks, release generation, Vite bundling, and the unchanged hard
performance budget:

```text
phoneJsRawBytes: 665514 B <= 665600 B
totalJsRawBytes: 665514 B <= 665600 B
desktopJsRawBytes: 577064 B <= 581632 B
desktopJsHeadroomBytes: 4568 B >= 4096 B
phoneJsHeadroomBytes: 86 B
```

The budget was not raised. This artifact is still not an accepted release
artifact because the current Chromium presentation cell is red; WebKit and
TTG cells remain unrun after the stop. The diagnostic build is at
`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/codex-frame-lock-seek-migration/dist/`.

### Historical evidence

- The earlier complete release report was prose-only: 133 passed, 43 failed,
  4 skipped. It is historical and is not tied to the current dirty tree, so it
  is not used as a current qualification result.
- Earlier prose also mentioned 138/38/4 after intermediate fixes; this is
  likewise historical and not a current matrix result.
- `docs/superpowers/evidence/frame-lock-phase-c-review.md` is absent. Its
  status is `MISSING_HISTORICAL_EVIDENCE`; no retrospective Phase C
  `PROCEED_TO_PHONE` pass is fabricated.
- The screenshots recorded in
  `docs/superpowers/evidence/frame-lock-spike-results.md` support the earlier
  PH/Crane phone slice but do not identify the device/iOS/Safari support floor
  or provide Task 21 memory evidence.

## Failure ledger

| Identity | Test / observation | Reproduction | Class | Root group | Owner | Closure status |
| --- | --- | --- | --- | --- | --- | --- |
| `9ec3e2b` + dirty tree; fresh diagnostic dist | Full release matrix previously reported as 133/43/4 | Historical only | Not classifiable as current | Mixed; includes delayed chunks, lifecycle/BFCache, AOD/Figure2, PH/Crane | Task 21 qualification, after Tasks 18–20 | Must not be fixed from prose |
| Earlier dirty tree; budget verifier | `phoneJsRawBytes` and `totalJsRawBytes` 666748 > 665600 | Deterministic | Superseded acceptance result | JS budget / chunk ownership | Task 18 | Superseded by later 665514-byte build |
| Earlier dirty tree; fresh dist | Figure3 reverse poster fallback Chromium case passed | Reported, not reproduced in this continuation | Historical/reported-only | ownership/static fallback | Task 18 | Superseded; current WebKit case remains red |
| `9ec3e2b` + dirty tree `b7e7cdd4`; Vitest `PhoneFigure3.clean.test.tsx` | `rejects activation replaced while its causal frame promise is pending`: old presenter promise reported `figure3-paper-canvas` after `commands.pause()` | Deterministic | Resolved regression | stale presenter reset / generation | Task 18 | Closed by active-clock identity invalidation; the then-current nine-file suite passed 245/245 |
| Current dirty tree; `pnpm build` | `verify:boolean-data` rejected `booleans_as_integers` in `app/vite.config.ts` | Deterministic | Resolved build-contract regression | build contract / CSS boolean data attributes | Task 18 | Closed by removing the forbidden minifier option; current build is within the unchanged hard budget |
| Current dirty tree after shared `clampProgress`/release helper experiment; focused Vitest | 25 failures: clean Figure3/TTG mocks did not expose `clampProgress`; TTG release fixture supplied a source without `getAttribute` | Deterministic | Resolved test-harness/compatibility regression | shared helper API and mock media shape | Task 18 | Closed by updating in-scope mocks and optional source-attribute handling; current named suite passed 245/245 |
| Earlier baseline history | Figure3 delayed-chunk and TTG delayed full-run failures were observed in earlier runs | Baseline/oracle status, not reproduced on this freeze | Baseline or oracle candidate | delayed module activation | Scope decision if current focused gate fails | Reproduce once on a stable artifact before edits |
| Historical release prose | Hero BFCache, AOD/Figure2, PH/Crane regressions | No current artifact identity | Unknown | lifecycle/shared blast radius | Task 18 L3 or later owning task | Do not absorb without characterization |
| Earlier fresh build; `phone-portrait-chromium` + `phone-portrait-webkit`; `r5-phone-clean-presentation.spec.ts:3322` | `Figure3 initial surface uses decoded frame zero and fills the visual viewport`: formal Brand → Figure3 observation remained `initialSurface=poster-fallback`, `mediaState=fallback`, then `media-prepare-timeout`/`presentation-proof-timeout` | Reported, not reproduced in this continuation | Superseded browser result | Figure3 prewarm-to-formal activation ownership | Task 18 | Superseded; do not treat as current failure without reproduction |
| Earlier fresh build `054904b5`; `phone-portrait-webkit`; `r5-phone-clean-presentation.spec.ts:3694` | `Figure3 slice commits forward and reverse twice without resource growth`: second cycle receives `poster-fallback` instead of `video-frame-zero` | Deterministic | Superseded browser result | Figure3 retained/prewarm activation under repeated traversal | Task 18 | Superseded by the bounded Figure3 prewarm attempt below; same case remains open |
| Current fresh build `e5ebe27e`; `phone-portrait-webkit`; `r5-phone-clean-presentation.spec.ts:3696` | After the Figure3-only repeated-prewarm change, `Figure3 slice commits forward and reverse twice without resource growth` still receives `poster-fallback` instead of `video-frame-zero` on the second cycle; fallback reason is `deadline`, with formal binding lineage `13|phone-story:formal:1:6:segment:figure3-animation:brand-figure3:frame:29`. The test-only recorder observed one formal `play`/fulfilled call, a valid source/readiness state, one RVFC registration, zero RVFC callbacks, unchanged Canvas frame/index `0`, then `cancelVideoFrameCallback` before fallback. | Deterministic; classified by one persisted WebKit trace | Superseded browser result | Formal activation reaches RVFC registration, but WebKit does not deliver the callback; the later zero-lease repair addresses the upstream driver teardown window | Task 18 | Superseded by the 2026-09-02 zero-lease repair below |
| Current fresh build `545f37a1`; `phone-portrait-webkit`; `r5-phone-clean-presentation.spec.ts:3696` | After the approved zero-lease hard-release repair, `Figure3 slice commits forward and reverse twice without resource growth` passed, including the repeated Figure3 traversal and resource assertions | Deterministic; one allowed WebKit run | Resolved in this attempt | physical driver lifetime / zero-lease gap during prime seek | Task 18 | Passed once; T18-4 broader two-engine and repeated-run gates remain pending |
| Current fresh build `734f24a6`; `phone-portrait-webkit`; `r5-phone-clean-presentation.spec.ts:3696` | The first review follow-up formulation cleared `priming` immediately on logical reset; the repeated Figure3 case again reached `poster-fallback` on the second cycle after a formal RVFC was registered during an active prime seek | Reproduced once; superseded by the next characterization | Current regression in provisional formulation | active prime seek overlap after logical reset | Task 18 | Superseded by preserving an active physical prime seek until `seeked`; no wider browser run was based on this build |
| Current fresh build `9104513b`; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:2565` | Full phone presentation cell stopped at `stable Hero keeps Figure1 static after visibility and BFCache lifecycle recovery`: `data-portrait-figure-frame` expected `ready`, received absent after the synthetic `pagehide/pageshow` recovery. The one test-only diagnostic rerun observed initial generation 1 with a successful RVFC callback, then recovery generation 2 with `activation=spent`, no post-pageshow `play`/RVFC registration/callback, and terminal `deadline:mediaPrepare`; the page entered retry/fault state. | Reproduced twice on the current artifact, then reproduced with the same mechanism on the detached `9ec3e2b` baseline | Current reproduction with historical baseline debt confirmed by A/B | Hero lifecycle/BFCache recovery | Later Hero owner, not Task 18 Figure3/TTG | Exact title-only exemption approved for Task 18 phone-portrait Chromium/WebKit presentation cells; retain as Hero debt |
| Detached baseline `9ec3e2b` artifact; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:3068` | Original `Hero lifecycle recovery completes an in-flight entrance without replaying Loader` timed out waiting for legacy `data-phone-figure-playback="paused"`; the attribute remained absent for 5 seconds | Deterministic once | Baseline oracle unavailable | Hero lifecycle synchronization / legacy playback proof | Scope decision; not covered by the approved BFCache exemption | Stop the triangle; do not run the `video.paused` baseline variant or infer an exemption from this result |
| Current fresh build `9104513b`; normalized persisted barrier; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:2675` | `Hero lifecycle recovery completes an in-flight entrance without replaying Loader` passed the persisted barrier but failed the formal `data-hero-progress="1.0000"` assertion in both `repeat-each=2` runs, with observed values `0.0041` and `0.0042` | Deterministic 2/2 | Current reproduction; baseline A/B below also fails | Hero lifecycle/BFCache recovery | Later Hero owner, not Task 18 Figure3/TTG | Exact title-only exemption approved for Task 18 phone-portrait Chromium/WebKit presentation cells; retain persisted barrier and formal assertions as Hero debt |
| Detached baseline `9ec3e2b` artifact; normalized persisted barrier; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:3085` | The same second test passed the persisted barrier but failed the formal `data-hero-progress="1.0000"` assertion with observed value `0.0033` | Deterministic once | Reproducible historical baseline debt candidate | Hero lifecycle/BFCache recovery | Later Hero owner, not Task 18 Figure3/TTG | Supports the exact title-only exemption; retain the normalized harness and formal assertions |
| Current artifact `9104513b`; combined exact Hero exclusions; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:2849` | `AOD only advances its packed-alpha source after its outgoing trusted input` failed in the full cell after 16 prior passes and in both focused repetitions: `currentTime=0`, `paused=true`, `activation=false`, `method-top`, commit sequence `2`, and packed-alpha canvas generation `1` with compositor inactive; `AOD source playback did not advance` | Deterministic 3/3 current runs | Superseded terminal-state observation | AOD packed-alpha outgoing-input playback/lifecycle | Task 18 | Superseded by the bounded timeline A/B below; do not infer a shared-runtime regression or apply the historical exemption |
| Detached baseline `9ec3e2b`; same AOD title; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:2833` | The same AOD wait failed with `activation=false`, `method-top`, but `video=null` and `canvas=null`; it did not reproduce the current artifact's retained `currentTime=0`, `paused=true` media state | Deterministic once | Superseded terminal-state A/B observation | AOD packed-alpha outgoing-input playback/lifecycle | Task 18 | Superseded by the bounded timeline A/B below; baseline retirement is post-submit evidence |
| Current artifact `9104513b`; same AOD title; test-only timeline recorder; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:3250` | Four lifecycle marks completed in order. The paused AOD video received one RVFC callback, 78 `currentTime` writes with 77 `seeking`/`seeked` pairs, and advanced from `0.0000` to `2.5667`; the packed-alpha Canvas advanced to `mediaTime=2.5667`. Original `samples` stayed empty because `timelineVideoFrameReady` never appeared, while 153 states satisfied every other sample gate | Deterministic once; one bounded run | Test-oracle defect; A/B-equivalent playback | Stale `timelineVideoFrameReady` sampling prerequisite | Task 18 E2E contract | Test-only sampler gate corrected; formal mapped-time and Canvas-advancement assertions retained; no production regression or exemption established |
| Detached baseline `9ec3e2b`; same AOD title; identical test-only timeline recorder; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:3233` | Same transaction/preparing → transaction/playing → stable/method-top sequence. The paused AOD video received one RVFC callback, 78 `currentTime` writes with 77 `seeking`/`seeked` pairs, and advanced from `0.0000` to `2.5667`; the packed-alpha Canvas advanced to `mediaTime=2.5667`. Original `samples` stayed empty for the same absent timeline flag, while 153 states satisfied every other sample gate | Deterministic once; one bounded run | Test-oracle defect; A/B-equivalent playback | Stale `timelineVideoFrameReady` sampling prerequisite | Task 18 E2E contract | Confirms no current-only shared-runtime regression; baseline E2E file restored clean except the pre-existing `app/node_modules` symlink |
| Current artifact `9104513b` and detached baseline `9ec3e2b`; two exact Hero exclusions; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts` Figure2 conceal case | The stale symbolic mask oracle was corrected to the direct WebP atlas contract; Figure2 midpoint passed `2/2` and forward/reverse pixel-complementary siblings passed. The restarted 86-test presentation cell first stopped at this test because the isolation helper counted a non-rendering `<source>` descendant; after the rendered-descendant correction, the exact case passed `2/2` | Deterministic current `2/2` plus full-cell stop before and focused rerun; baseline A/B `1/1` on the superseded helper | Resolved test-harness isolation oracle defect | `captureDepthPlaneAlpha` now requires visible styles and a non-zero client rect; the pixel proof remains unchanged | Task 18 E2E contract | Closed as test-only; no production regression or exemption established |
| Current artifact `9104513b` and detached baseline `9ec3e2b`; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts` retained-arch case | The full cell initially timed out before creating the `figure2-animation` transaction because it omitted the native-reading-edge setup. After adding `prepareCompleteStoryNativeEdge(page, 'method-top', 'forward')`, the exact case passed `2/2` and passed as test 23 in the restarted full cell | Deterministic current `2/2` plus full-cell pass; baseline had the same pre-fix omission | Resolved test-harness setup defect | Method native-reading boundary was not prepared before the fresh ArrowDown | Task 18 E2E contract | Closed as test-only; no production change, regression, or exemption established |
| Current artifact `9104513b`; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:3291` | The old `Figure2 reverse media stage seeks from the parked endpoint to frame zero` assertion expected physical time to return below `.1`; the test-only trace instead showed active Canvas/media advancing from `2.6` through `5.1667`, followed by a retired `mediaTime=null`/`readyState=0` sample | Deterministic once plus diagnostic trace | Superseded E2E contract mismatch | Figure2 authored reverse-half frame mapping | Task 18 E2E contract | Superseded by reverse-half assertions; focused corrected case passed `2/2`, with paused/no-play/no-activation proofs retained |
| Current artifact `9104513b`; two exact Hero exclusions; `phone-portrait-chromium`; `r5-phone-clean-presentation.spec.ts:4570` | The restarted 86-test presentation cell passed 55 tests, had one existing skipped test, then `PH slice completes Lab → PH → Education forward/reverse twice without growth` timed out after 10s in `completePhSliceAttempt` while waiting for the expected PH ink segment; 29 tests did not run | Deterministic once; `--max-failures=1` | Current non-exempt browser failure; mechanism unclassified | PH repeated-cycle transition/ink segment contract or test setup | Task 18 E2E contract; no production regression or exemption established | Stopped immediately; do not run WebKit/TTG, rerun baseline, or modify production before a precise next-step decision |
| Earlier fresh build; both phone engines; `r5-phone-clean-presentation.spec.ts:3713` | `Figure3 slice keeps Brand proved while its lazy scene chunk is delayed`: expected `transaction`, observed `stable` while the delayed leaf remained unloaded | Reported, not reproduced in this continuation | Superseded browser result | delayed Figure3 leaf activation | Task 18 | Superseded; do not treat as current failure without reproduction |
| Earlier fresh build; both phone engines; `r5-phone-clean-presentation.spec.ts:4240` | `Group 4-5 keeps Services proved while the TTG leaf chunk is delayed`: expected `transaction`, observed `stable` while Services remained current | Reported, not reproduced in this continuation | Superseded browser result | delayed TTG leaf activation | Task 18 | Superseded; do not treat as current failure without reproduction |
| Earlier fresh build; both phone engines; shared release matrix cases | Hero BFCache/lifecycle recovery, AOD outgoing-input, Figure2 staged/retained/mask cases, PH/Crane delayed/cycle cases, Group 6–7 contact/retry cases, complete-story Ink contribution, and one WebKit pacing case failed in the same 180-case run | Reported, not reproduced in this continuation | Historical/reported-only; root causes not separated | Shared lifecycle/packed surfaces/late-route qualification | Task 18 or later owning task after causal audit | Superseded; do not claim as current baseline |

Before the approved zero-lease repair, no unchanged failing command was
repeated after this freeze. Any new browser failure must add a row with the
exact build identity, project, case, and first assertion before production code
is edited.

## Earlier continuation update — 2026-09-01 (superseded)

The paused worktree was resumed without changing `main`. The current dirty
tree includes the Task 18 implementation and the shared phone registration
fix at `9ec3e2b`; the user-owned closure plan remains untracked and unstaged.

The following values were reported by the previous continuation but were not
reproduced from raw output in this continuation:

```text
9 files, 244 tests passed
phoneJsRawBytes: 665578 B <= 665600 B
totalJsRawBytes: 665578 B <= 665600 B
desktopJsRawBytes: 577071 B <= 581632 B
138 passed, 38 failed, 4 skipped across 180 cases
```

These are `REPORTED_NOT_REPRODUCED`/historical values, not the current Task 18
status. The current raw results are recorded in the T18-0 and Figure3 prewarm
follow-up sections below.

## T18-0 preflight — 2026-09-01

T18-0 was completed on the requested existing worktree in approximately three
minutes. The worktree and branch matched the handoff document, and no dirty
path was found outside the listed production, planning, and evidence scope.

- Current HEAD: `9ec3e2bbcd5137f706ba3f19f64de637981f47cb` on
  `codex/frame-lock-seek-migration`; main tracked content was not modified.
- Current inventory: 19 tracked modified files; one untracked production
  presenter; three untracked planning/evidence documents. `pnpm-lock.yaml`
  is clean. Existing `node_modules/` is present and pnpm is `8.15.1`.
- Current tracked dirty-diff SHA-256: `744294d039a82a02dbb644b03054800241f41906b58cd74b6e9686d8f4f54dfa`.
  This differs from the earlier freeze hash; the current hash is the identity
  to carry forward and the exact path inventory above was rechecked.
- `app/dist/` is absent after the preflight, so prior build and browser values
  remain `REPORTED_NOT_REPRODUCED` until a fresh immutable build is created.
- Confirmed task-owned stale processes were terminated: preview ports 4203,
  4204, and 4174, plus their associated Playwright Chromium/WebKit process
  trees. System-level WebKit processes outside this worktree were left alone.
- Deterministic command (current tree, no production edits): the named nine
  in-scope Vitest files. Result: `9 files / 245 tests passed`, exit 0, real
  time `2.69s`. This is reproduced T18-0 evidence.
- The prior browser `7 passed / 1 failed`, `138/38/4`, and prior budget
  numbers have no raw output in this continuation and are retained only as
  `REPORTED_NOT_REPRODUCED`; the historical `133/43/4` remains historical.

T18-0 stop conditions are clear: the tree identity is known, no stale
task-owned process remains, and no scope expansion is required. The next
single action is T18-1 overlap characterization; no browser matrix has been
started.

## T18-1 overlap characterization — 2026-09-01

Added one test-only deterministic regression at
`app/src/media/presented-frame-clock.test.ts:277` and ran it once before any
production edit. The sequence is:

1. Presenter A starts an exact RVFC request on the retained physical video.
2. The active binding is replaced and presenter B starts a successor request
   on that same video and shared strict driver.
3. A is reset while B is waiting for its RVFC.
4. The test then delivers B's exact callback and requires A to be stale while
   B alone reports `scene-canvas-draw`.

Result: **RED**, `1 failed / 7 passed` in the focused clock file. A's receipt
was stale as expected, but B also became stale instead of presented. No
`reportFrame` was emitted for either binding. This is deterministic evidence
that `StrictPresentedFrameClock.dispose()` reached through presenter A and
disposed the shared physical driver still owned by B. It selects the first
T18-2 hypothesis: fix presenter lifecycle ownership in
`phone-frame-lock-presenter.ts` only; do not change the strict driver yet.

No browser run was started. This is implementation attempt `0`; the next
single action is the presenter-only ownership fix followed by the new red test
and clock/Figure3 sibling tests.

## Earlier T18-2/T18-3 presenter-only repair attempts — 2026-09-01 (superseded)

The deterministic overlap result selected the presenter-only hypothesis. The
production change stayed within `app/src/media/phone-frame-lock-presenter.ts`:
the presenter now invalidates its own logical request with an internal abort
controller and no longer disposes the shared physical strict driver from
`reset()`. External request aborts are forwarded, and the existing binding,
video identity, exact RVFC evidence, and Canvas paint checks remain required
before a receipt can report success.

The focused regression and nearest Figure3/clock siblings were run after the
final presenter formulation:

```text
pnpm exec vitest run src/media/presented-frame-clock.test.ts \
  src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx \
  src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx
34 tests passed in 3 files
```

The first implementation formulation used per-request cancellation tracking.
Its one fresh production build completed all non-budget checks but failed the
unchanged hard phone-JS budget:

```text
phoneJsRawBytes: 665882 B > 665600 B
totalJsRawBytes: 665882 B > 665600 B
```

That result supplied new size evidence. The implementation was then compacted
to one active presenter controller while preserving the same lifecycle
semantics. Its one fresh production build again completed all non-budget
checks but failed the same hard budget:

```text
phoneJsRawBytes: 665818 B > 665600 B
totalJsRawBytes: 665818 B > 665600 B
```

These are the two permitted T18-3 implementation attempts. No WebKit or
Chromium browser case was run because the required build gate remained red.
The current generated `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/codex-frame-lock-seek-migration/dist/`
is therefore diagnostic only, not an accepted immutable release artifact. No
task-owned preview, Vitest, or Playwright process remains. Current tree
identity after the attempts is HEAD `9ec3e2bbcd5137f706ba3f19f64de637981f47cb`
with dirty tracked-diff SHA-256
`2465ca8b1a771784fff86f89c2f1423ce65e130312aa26bf4cd5d0e8569a3148`.

Per the plan's two-attempt stop condition, Task 18 is paused here. The next
single action requires a new user-approved, size-neutral presenter-only
attempt; the budget must not be raised and later Task 18 gates must not start
until the build is green.

## Correctness-review follow-up — 2026-09-01 (superseded browser attempt)

The review authorized one new T18-2 hypothesis: logical clock disposal must
release only that clock's ownership and must not terminally dispose a shared
physical driver still used by another clock. The production change is limited
to `app/src/media/strict-timeline-video-driver.ts` and the presenter was
restored to a lightweight `clock.dispose()` adapter. The shared driver now
tracks clock leases, supports request cancellation without terminal teardown,
and clears both driver and clock diagnostics on hard release. The deterministic
tests cover both dispose orders, pending disposal without a successor, and
hard-release cleanup.

Current tree identity remains HEAD
`9ec3e2bbcd5137f706ba3f19f64de637981f47cb` with dirty tracked-diff SHA-256
`d511c1e8d52ceb8a830de220ad1202dcaf6954fbea414bdb44f3a0bbf8f48090`.

Focused result after the change:

```text
3 files / 38 tests passed
```

The fresh production build passed all static, media, release, and budget gates:

```text
phoneJsRawBytes: 665509 B <= 665600 B
totalJsRawBytes: 665509 B <= 665600 B
desktopJsRawBytes: 577064 B <= 581632 B
desktopJsHeadroomBytes: 4568 B >= 4096 B
artifactTreeSha256: 054904b5973fafab74687c19d096362760438484b64cc4b4c9b13b4d2f5f7f4a
```

The one permitted WebKit reproduction was then run with this artifact:

```text
command: pnpm exec playwright test --config playwright.release.config.ts \
  --project=phone-portrait-webkit e2e/r5-phone-clean-presentation.spec.ts \
  -g "Figure3 slice commits forward and reverse twice without resource growth"
result: FAIL at e2e/r5-phone-clean-presentation.spec.ts:3694
assertion: expected data-phone-figure3-initial-surface=video-frame-zero
observed: data-phone-figure3-initial-surface=poster-fallback on the second cycle
```

The Chromium sibling was not run because WebKit failed. Task 18 was paused at
this focused browser stop condition; the next user direction authorized a
deterministic Figure3 prewarm characterization and one Figure3-only attempt,
recorded below. No task-owned preview, Vitest, or Playwright process remains.

## Figure3 repeated-prewarm characterization and bounded attempt — 2026-09-01

The new test-only characterization was added at
`app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx:246` and
was run before the Figure3 production edit. It performs the requested sequence:

1. Complete a formal activation and require `video-frame-zero`.
2. Rebind a hidden `prewarm:` binding on the same retained Figure3 leaf.
3. Allow the prewarm microtasks to run and require no `prepareFrame`, no
   `play`, and no prewarm proof report.
4. Rebind formally, activate, require exactly one new `prepareFrame`, and
   require a formal `video-frame-zero` proof.

The characterization was **RED**: the existing rebind path called
`prepareFrame` once for the hidden prewarm with run id
`prewarm:figure3-animation:frame:2`. This isolated the repeated-prewarm
ownership hypothesis without another browser sample.

The bounded Figure3-only change is at
`app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx:565`: a warm prewarm
returns while retaining the existing frame-zero surface/proof; a cold prewarm
may establish only the existing static poster fallback. Neither path starts a
decoder request or native play; formal activation remains the only frame
request owner.

Current tree identity remains HEAD
`9ec3e2bbcd5137f706ba3f19f64de637981f47cb` with dirty tracked-diff SHA-256
`ad5b695c449c4ea4fbd06af38e4e3a1e11c2913ce9e7e4a0e1f00ab8f679d550`.

Post-change deterministic validation:

```text
9 files / 251 tests passed
```

The fresh build passed all static, media, release, and unchanged budget gates:

```text
phoneJsRawBytes: 665559 B <= 665600 B
totalJsRawBytes: 665559 B <= 665600 B
desktopJsRawBytes: 577064 B <= 581632 B
desktopJsHeadroomBytes: 4568 B >= 4096 B
phoneJsHeadroomBytes: 41 B
artifactTreeSha256: e5ebe27e40d5866487a3c42a3fd618ca40b625f36cf4231f9b552b100b73f86c
```

The one permitted follow-up WebKit case was then run with that artifact:

```text
command: pnpm exec playwright test --config playwright.release.config.ts \
  --project=phone-portrait-webkit e2e/r5-phone-clean-presentation.spec.ts \
  -g "Figure3 slice commits forward and reverse twice without resource growth"
result: FAIL at e2e/r5-phone-clean-presentation.spec.ts:3694
assertion: expected data-phone-figure3-initial-surface=video-frame-zero
observed: data-phone-figure3-initial-surface=poster-fallback after the second cycle
fallback: deadline
proof lineage: 13|phone-story:formal:1:6:segment:figure3-animation:brand-figure3:frame:29
context: app/test-results/r5-phone-clean-presentatio-ea7fe-ice-without-resource-growth-phone-portrait-webkit/error-context.md
```

The Chromium sibling and all wider browser cases were not run because this
WebKit case remained red. No fourth production hypothesis was started, no
budget was raised, the clock/driver change remains uncommitted, and no
task-owned preview, Vitest, or Playwright process remains. `main` tracked
content and its unrelated `.playwright-cli/` remain untouched.

## Pure Figure3 WebKit diagnostic sample — 2026-09-01

The next action was deliberately limited to the E2E layer. The diagnostic
delta touched only `app/e2e/r5-phone-clean-assertions.ts` and
`app/e2e/r5-phone-clean-presentation.spec.ts`; no production file was changed
for this sample. The recorder was installed before navigation and captured
the Figure3 video element's media state, timeline datasets, lifecycle event
callbacks, RVFC metadata, Canvas dataset, and cancellation/cleanup ordering.

Only the named repeated Figure3 case was exercised under
`phone-portrait-webkit`:

```text
pnpm exec playwright test --config playwright.release.config.ts \
  --project=phone-portrait-webkit e2e/r5-phone-clean-presentation.spec.ts \
  -g "Figure3 slice commits forward and reverse twice without resource growth"
```

The first recorder invocation did not persist its body after the assertion
failure, so the same exact case was rerun once with failure attachment output
enabled. No Chromium case or wider matrix was run. The persisted trace is
`app/test-results/r5-phone-clean-presentatio-ea7fe-ice-without-resource-growth-phone-portrait-webkit/figure3-media-diagnostic.json`:
4,633,104 bytes, 1,574 events, with the `second-cycle-start` mark at
`performance.now()=11971` and event index `1237`; the second-cycle slice has
337 events.

The decisive second-cycle evidence is:

| Time (`performance.now`, ms) | Evidence |
| ---: | --- |
| 11996 | Formal activation calls `play`; `currentSrc` is the Figure3 MP4, `readyState=4`, `networkState=1`, `currentTime=0.004`, and the retained prior Canvas is frame/index `0`. |
| 12005–12006 | The timeline enters run `phone-story:formal:1:6:segment:figure3-animation:brand-figure3`, generation `1`, target frame `0`, sequence `19`, `clockPending=true`; the media is primed to `currentTime=0.05` while `seeking=true`. |
| 12006 | Formal activation registers exactly one RVFC, handle `161`; no second-cycle prewarm request is present. |
| 12007–12008 | `playing` callback and `play` fulfillment occur; no rejection, `load`, or media error is recorded. |
| 12029 | `seeking` and `seeked` callbacks occur; `readyState=4`, `networkState=1`, `currentTime=0.004`, `seeking=false`, but the formal clock remains pending. |
| 12006–13222 | RVFC registrations: `1`; RVFC callbacks: `0`; the Canvas remains ready at frame/index `0` and no new frame-zero proof is produced. |
| 13222 | The pending RVFC handle `161` is cancelled, the video is paused, and the application `seeked` listener is removed; the formal timeline is then cleared. |
| 14737 | Figure3 enters `poster-fallback` with reason `deadline`; the proof lineage is formal (`13|phone-story:formal:1:6:segment:figure3-animation:brand-figure3:frame:29`). The video remains source-valid/readiness `4/1` with no media error. |

This uniquely classifies the sample as **RVFC registered but WebKit did not
deliver a callback**. It is not “activation emitted no request” (formal
`play` and RVFC registration are present), not source/readiness recovery
failure (`currentSrc` is valid, `readyState=4`, and `seeked` fired), not a
wrong RVFC frame (there was no callback), and not Canvas gating after a
successful commit (Canvas never changed and no new proof was produced).
The later cancel/dispose sequence is the timeout cleanup after the missing
callback, not evidence that the formal request was cleaned up first.

No production patch or budget change was included in that diagnostic sample;
its evidence directly supported the approved zero-lease repair recorded below.
The diagnostic sample still did not authorize Chromium or full-matrix runs.

## Zero-lease hard-release repair — 2026-09-02 (initial attempt)

The diagnostic trace established the single approved hypothesis: a logical
clock can be disposed while its prime seek is still active, and the current
clock-count lease path then hard-disposes the physical driver before the next
logical clock exists. The repair binds the physical driver to the video
`WeakMap`/component lifetime instead of instantaneous clock count:

- Removed `strictDriverClockCounts` and its retain/release teardown path.
- A logical clock now obtains the shared driver for its video and `dispose()`
  only calls `cancelFrame()` for its own request and resets its logical
  snapshot.
- `cancelFrame()` clears the current request's stale physical diagnostics and
  readiness without removing the video's listeners or disposing the driver.
- Existing explicit `disposeStrictTimelineVideoDriver(video)` remains the only
  physical hard release and still clears driver diagnostics/listeners.

Before production edits, the new red test at
`app/src/media/presented-frame-clock.test.ts` created a prime seek for A,
disposed A while `video.seeking` was true, asserted the `seeked` listener
survived the zero-clock gap, then created B and required an exact RVFC receipt.
It failed against the lease implementation because the listener count was
`0` instead of `1`. After the repair it passed, together with the existing
dispose-order, pending-dispose, hard-release, and presenter lifecycle tests.

Focused validation:

```text
3 files / 40 tests passed
```

The one build on the repaired tree passed all static, media, release, and
unchanged budget gates:

```text
phoneJsRawBytes: 665436 B <= 665600 B
totalJsRawBytes: 665436 B <= 665600 B
desktopJsRawBytes: 576941 B <= 581632 B
desktopJsHeadroomBytes: 4691 B >= 4096 B
phoneJsHeadroomBytes: 164 B
artifactTreeSha256: 545f37a1f1225d983a593662b7bb5711cf00c2c42a2d0ba26391df9c2bf108f5
```

After that build, only the specified WebKit case was run once:

```text
project: phone-portrait-webkit
spec: app/e2e/r5-phone-clean-presentation.spec.ts
case: Figure3 slice commits forward and reverse twice without resource growth
result: PASS; 1 passed in 25.6s
```

No Chromium case, second WebKit run, or wider matrix was started at that
initial checkpoint. The repair remained uncommitted and was then subjected to
the correctness-review follow-up below.

## Correctness-review follow-up — 2026-09-02

The review identified two lifecycle gaps in the initial zero-lease formulation
and one invalidation contract in TTG. They were addressed with test-first
characterizations:

- `FakeVideo` now covers a `currentTime` write that leaves `seeking=false` and
  counts RVFC registrations. A disposed timer-prime request must clear its
  `priming` marker so a successor cannot remain pending forever.
- An active physical prime seek is different: `cancelFrame()` and a
  cross-run `activate()` cancel only its timer while `video.seeking` is true.
  The physical `priming` marker and `seeked` listener survive until that seek
  settles, so a successor waits instead of issuing an overlapping WebKit seek.
  Once no seek is active, the full prime state is cleared.
- `StrictPresentedFrameClock` reacquires the current per-video driver on each
  non-disposed request. An explicit hard release still deletes the WeakMap
  entry, while a live clock can obtain the replacement driver on recovery and
  does not create one merely during dispose.
- TTG `held` now parks by pausing only. `releasePhoneTtgVideo()` remains the
  explicit leaf-retirement path that hard-releases the driver and media
  sources.

The new clock tests were red before the corresponding production changes:
timer-prime successor recovery, live-clock recovery after hard release, and
the strengthened zero-lease seek ordering. The TTG clean test was also red
before removing the held-phase hard release. Final deterministic validation was:

```text
5 files / 58 tests passed
```

The fresh build for the browser checks passed all static, media, release, and
unchanged budget gates:

```text
phoneJsRawBytes: 665514 B <= 665600 B
totalJsRawBytes: 665514 B <= 665600 B
desktopJsRawBytes: 577104 B <= 581632 B
phoneJsHeadroomBytes: 86 B
desktopJsHeadroomBytes: 4528 B
artifactTreeSha256: 9104513bdd6f86c60a6718ac9cdc35efb1c1db5a61526db109420c92f5204ddd
```

On that same artifact, the bounded browser evidence was:

- The repeated Figure3 case passed twice in `phone-portrait-webkit` and once
  in `phone-portrait-chromium`.
- The focused sibling set passed `3/3` in each engine: Figure3 initial frame
  zero, delayed Figure3 chunk, and delayed TTG chunk.
- The first full `r5-phone-clean-presentation.spec.ts` cell was started in
  `phone-portrait-chromium` as required by T18-5, but stopped immediately
  after its first non-Figure3/TTG failure at test 11/88. The failure is the
  Hero synthetic BFCache recovery recorded in the failure ledger. The WebKit
  full cell and `r5-ttg-alpha.spec.ts` cells were not started.

No Hero or other out-of-scope production change was made. The candidate
remains uncommitted, and Task 18 cannot be marked complete until the remaining
non-exempt browser failure is resolved or receives an explicitly approved,
precisely scoped decision. The two Hero lifecycle debts remain explicit
follow-up work and are not permanent skips.

## Gates remaining

1. The two exact Hero lifecycle exemptions are approved only for their named
   titles in the Task 18 phone-portrait Chromium/WebKit presentation cells.
   They are not permanent skips and must not be widened.
2. The current Chromium acceptance is stopped by the non-exempt `Group 6-7
   Crane ↔ Contact commits twice with native input release and no growth` case.
   The one-run diagnostic now exposes a real fault at `cycle 2 forward`,
   boundary `0`: outer `deadline:rollback`, with a runtime-tail
   `deadline:mediaPrepare` during rollback generation `5`. The causal owner
   is not yet classified. The current repeat is stable, but the requested
   baseline A/B cannot run because the approved baseline path is absent and
   no replacement worktree was authorized. Obtain a new, explicitly scoped
   direction before any further browser cell; do not infer a production
   regression, add an exemption, expand either Hero exemption, or mark the
   stopped cell green.
3. Only after the four Task 18 spec cells are green may Task 18 be committed
   atomically and Tasks 19–20 begin.
4. Reserve the full six-project release matrix, device identity, iOS/Safari
   floor, memory, and final user checkpoint for Task 21. Task 22 remains
   blocked until those gates pass.
