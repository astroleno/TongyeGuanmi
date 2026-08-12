# R5 Phone Clean Runtime — Task 13 acceptance

- Date: 2026-08-12
- Status: **NO-GO for candidate/release — latest P0 focused automation is
  green; exact-source full regression, physical iPhone, and memory remain open**
- Current claim: **v33 remains reproducible invalidated history. The current
  dirty replacement closes the latest fixed-plane Figure2 mask and PH rebind
  findings in focused tests, but a full exact-source run is not yet recorded,
  it is not immutable, and it has not passed physical iPhone or memory gates.**
- Report branch: `codex/r5-phone-clean-runtime-convergence`
- Candidate worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime`
- Candidate artifact: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/dist/`

## 2026-08-12 depth/copy/media authority invalidation

The current dirty build remains **NO-GO as a candidate or release artifact**.
Its focused repair is complete, but broad exact-source automation and physical
iPhone verification remain open. Four
failure-first contracts cover the invalidation: the
retained Figure2 arch must have only the Shell authority; the depth leg must
reveal fully opaque Proof after rendering its current Ink frame; native
reading and its prepared mirror must never paint together; and PH/Crane may
report only the post-activation generations that remain visible. No candidate,
tag, or release identity may be created until these contracts, the full
automated gates, two physical iPhone passes, and memory qualification pass.

## 2026-08-12 fixed-plane depth and PH rebind correction

The previous semantic-root mask topology is superseded. The Figure2 scene root
is one viewport high while the Proof compound is three viewports high, so the
same `100% 100%` mask was sampled in incompatible coordinate systems. The
current implementation resolves the two equal fixed A/B planes by semantic
content and applies Figure2 `conceal` plus Proof `reveal` there. The retained
arch remains an unmasked Shell sibling above the depth Ink.

WebKit also rejected runtime conceal inversion: SVG filtering could clear the
mask and CSS composition could produce non-complementary pixels. The existing
single atlas now contains 32 interleaved alpha-complement pairs. Reveal and
conceal reference adjacent tiles through one shared mutable frame transform,
so frame selection is atomic and no runtime filter or second resource exists.
The atlas decreased from 11,184 B to 10,402 B.

The Lab → PH proof path now survives report-port churn. Runtime treats an
identical report binding as a no-op instead of minting a frame token and
calling leaf `rebind`. A genuine same-transaction plane revision preserves the
PH admitted generation and bounded probe while moving report authority to the
new binding. New transactions, rollback, pause, retirement, and disposal still
clear admission and reject stale frames.

| Fresh exact-source focused gate | Result |
| --- | --- |
| Focused Vitest | 6 files / 222 tests passed |
| Full Vitest | 177 files / 1,377 tests passed |
| Figure2 physical partition, WebKit | 2/2 passed; additional repeat 4/4 passed |
| Figure2 physical partition, Chromium | 2/2 passed |
| Trusted Chromium Services → TTG → Lab → PH | 1/1 passed |
| Focused PH lifecycle, WebKit | 1/1 passed |
| TypeScript / production build | passed |
| Build budgets | Phone JS 665,381/665,600 B; initial CSS 76,695 B; WebP 11,918,200 B |
| Artifact tree | `58c4884119f62e252acfd74ba7eaeab4d9d277a31c5215522615cb5526e93aa7` |

After stale Chrome temporary clones were reclaimed, the 83-test presentation
file completed at 77 passed / 1 trusted-touch skip / 5 pressure failures in a
44.6-minute process. Both new Figure2 fixed-plane pixel-complement cases passed.
All five failed cases then passed an immediate isolated 5/5 rerun, including
the 60-leg traversal; the remaining Phone WebKit project files passed 35/35.
This rules out a stable failure in those five paths, but it is not one
uninterrupted all-green project gate. Full Vitest has passed; the formal Phone
WebKit gate remains open. The manifest remains `candidate=null`,
`sourceDirty=true`, and `pending-memory`; no commit, tag, push, deployment, or
candidate freeze is authorized.

## Frozen v33 identity

This identity is retained for reproduction only. It is not authorized for
formal physical iPhone acceptance. v32 and every earlier candidate also remain
invalidated history.

| Item | Value |
| --- | --- |
| candidate | `react-refactor-r5-parity-repair-candidate-v33` |
| source commit | `734b14f26957b0c39b836ed186058a7cd998dd1e` |
| annotated tag object | `93af85da3d5d4b19402b90653a97a97a2ff36605` |
| `sourceDirty` at build | `false` |
| `artifactTreeSha256` | `80a4554bd0c7ee09f59a13f78c6d29fbb222345d8fae929061ad40c883f8db0f` |
| release-manifest SHA-256 | `9fe9b03d40aea52985e8f08df583e122ac924f5836175d95cb36286ba644ec0c` |
| manifest inventory | 177 files / 84,063,223 bytes |
| manifest schema / qualification | schema 3 / `pending-memory` |
| phone JavaScript | 664,820 B / 665,600 B hard cap; 780 B headroom |

The generated authority is `dist/r5-release-manifest.json`. A later docs-only
ledger commit may move branch HEAD, but it does not replace the v33 source
commit, tag, manifest, or already-built `dist/` acceptance artifact. The tag
and candidate are local until explicitly pushed; no deployment was performed.

## Fresh v33 automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Vitest | pass | 177 files / 1,374 tests |
| Production build | pass | TypeScript, architecture, media, release-build, budget, CDN, and release-manifest gates |
| Phone portrait WebKit | pass | 108/108 suite contracts plus isolated 60-leg long-run 1/1 on the exact v33 build |
| Focused phone portrait WebKit | pass | PH/Crane physical-pixel assertions 2/2 |
| Focused phone portrait Chromium | pass | PH/Crane physical-pixel assertions 2/2 |
| Source hygiene | pass | clean v33 source at build; `git diff --check` passed |

The new assertions sample every PH outgoing Canvas frame's computed opacity and
`phonePhAlpha` state, and require both Crane terminal Canvas frames to be
observed while the source plane remains visible and the receiver remains
hidden. The 60-leg, two-cycle complete-story test passed in a fresh WebKit
process; the other 108 tests passed together in a second fresh process.

```text
pnpm exec playwright test --config=playwright.release.config.ts --project=phone-portrait-webkit --grep-invert="complete story proves all 60"
pnpm exec playwright test e2e/r5-phone-clean-presentation.spec.ts --config=playwright.release.config.ts --project=phone-portrait-webkit --grep="complete story proves all 60"
```

One initial monolithic WebKit process produced 107/109 after decoder exhaustion
at the second Method → Figure2 cycle and a post-failure worker boot timeout.
Both failed tests passed in fresh processes, including the entire 60-leg test;
the split gate is recorded explicitly rather than treating automatic retry as
product evidence.

## Physical-device and release gates

The replacement gate uses an explicit 650 KiB (665,600 B) phone/total raw-JS
cap—2 KiB above v31's cap—to carry the current-generation Canvas and
retained-media contracts; all other performance budgets remain unchanged.
Physical-device testing must cover real touch traversal, normal and Low
Power Mode, toolbar changes, background/BFCache recovery, autoplay restrictions,
AOD → Method, Figure2 arch/ghosting, Brand ↔ Figure3, TTG/PH/Crane playback,
A/B flash, viewport rebound, and compositor continuity. Figure3 sharpness must
be judged against the existing 1280×720 animation source.

v33 is **NO-GO for formal device acceptance and release**. Physical findings
require Figure1 single-clock playback, Star Map contrast parity, Figure2 arch
and depth ownership, Proof/native-reading parity, the authored Contact cue, and
one-gesture native-edge crossing before a replacement can be considered.

Independent release gates also remain:

- memory qualification remains `pending-memory`;
- physical iPhone Safari evidence is not yet recorded;

## 2026-08-11 physical-parity implementation checkpoint

The v33 replacement implementation is complete in the current dirty worktree,
but no immutable candidate has been created. All nine plan-specific Phone
WebKit and Chromium contracts pass. After the 2026-08-12 correctness follow-up,
full Vitest passes at 177 files / 1,364 tests, and the production build passes
the unchanged architecture, media, and size gates (665,565 B Phone JS; 76,685 B
initial CSS).

The complete 77-case Phone WebKit run passed 76 cases. Its sole failure was one
Method → AOD rollback; that exact test subsequently passed once in isolation
and 3/3 repeated. This is retained as a suite-level residual rather than hidden
with automatic retry or an unrelated AOD change.

The generated manifest correctly remains `candidate=null`, `sourceDirty=true`,
and `pending-memory`. The implementation is ready for the required physical
iPhone check, not release signing or candidate freezing.
- Figure3 sharpness remains limited by its 1280×720 source;
- the phone JavaScript budget has only 35 B headroom, so any code or build
  change requires a new budget check and candidate identity.

### 2026-08-12 correctness follow-up

Four review findings are closed in the current dirty checkpoint:

- the Figure2 depth mask now belongs to the transaction and survives stage
  frame-token changes without a second atlas decode or an unmasked frame;
- Proof → Brand neutralizes the inner Proof translation synchronously during
  `rebind`, before prepared evidence or the first playback render;
- Hero uses the transaction direction for the whole run, so reverse endpoint
  equality cannot create two timeline generations;
- the shared Proof closing component now has a global three-line layout
  contract, preserving desktop as well as phone rendering.

Fresh focused evidence is 31/31 Vitest contracts and 5/5 Phone WebKit contracts
covering the affected Figure2, Proof, and Hero boundaries.

The Proof typography follow-up then replaced block-element rectangles with
`Range.getClientRects()` text-line measurements at 320, 390, and 430 px. Both
tail rows are no-wrap and the phone-only closing size scales from 24–36 px; all
three authored rows remain one text line without horizontal overflow. The
current complete Phone WebKit project passes 112/112 in one process with no
automatic retry, including the 3.3-minute 60-segment traversal and the prior
Method → AOD boundary. Full Vitest remains 177 files / 1,364 tests; the exact
production build passes at 665,565 B Phone JS and 76,695 B initial CSS.

### 2026-08-12 Figure2 handoff and Crane presented-clock replacement

The latest dirty checkpoint moves the retained Figure2 arch into the A/B
compositor below Ink, replaces the whole-plane Figure2 conceal mask with a
Proof-only reveal owner, transfers native reading at the live scroll boundary,
and drives both Crane media lanes plus the camera from one presented-media
authored clock. The phone-only flock position is 2.5 `lvh` higher.

Fresh evidence for this exact source is focused Phone WebKit 7/7, full Vitest
177 files / 1,364 tests, a passing production build at 665,294 B Phone JS and
76,695 B initial CSS, and a complete Phone WebKit run of 112/112 in one process
without retry in 12.5 minutes, including the 3.2-minute 60-segment traversal.
The generated artifact tree is
`6415b7bf53d0590d47fa7d80fa6a31a01ca294451211472523f71861500de369`.

This closes the automated implementation only. The manifest remains
`candidate=null`, `sourceDirty=true`, and `pending-memory`; no commit, tag,
push, deployment, or candidate was created. Formal acceptance remains NO-GO
until this exact artifact passes the two-round physical iPhone matrix and
memory qualification.

### 2026-08-12 retained Proof and terminal Crane follow-up

Three post-implementation review gaps are closed in the latest dirty
checkpoint. Stable Proof now uses the scene coverage as its paper layer, keeps
the retained arch in the middle compositor layer, and exposes a transparent
native copy owner above it. A production WebKit pixel-difference probe proves
that hiding the arch changes more than 10,000 stable Proof pixels. Forward
Crane cannot advance the camera past the flock retirement cue until the current
generation presents its terminal flock frame. Native touch arbitration now
cancels the whole claim on any incremental direction reversal in either
direction.

Fresh evidence is full Vitest 177 files / 1,364 tests, a passing production
build at 665,396 B Phone JS and 76,695 B initial CSS, and the complete Phone
WebKit project 113/113 in one process without retry in 12.6 minutes, including
the 3.2-minute 60-segment traversal. The generated artifact tree is
`0ec7cc76a0e1a624957407bcc590394aa5699522f80e6c2c22a071a4c447e74c`.

This remains an automated dirty checkpoint, not a candidate. The manifest is
`candidate=null`, `sourceDirty=true`, and `pending-memory`; formal acceptance
still requires the two-round physical iPhone matrix and memory qualification.

### 2026-08-12 Proof reproject transparency follow-up

The native Proof copy now stays transparent whenever the committed scene is
`figure2-proof` and native reading remains enabled. This covers stable display
and same-scene toolbar, layout, and BFCache reprojects without making cinematic
Proof mirrors transparent during an actual scene transition.

The regression test holds a real height-change reproject open, verifies that
the native reading background remains transparent, freezes unrelated CSS
motion, and compares consecutive screenshots before and after hiding the
retained arch. The old selector failed with `rgb(237, 228, 210)`; the corrected
production build passes stable/reproject Phone WebKit 2/2 and full Vitest 177
files / 1,364 tests. Build and architecture gates pass at 665,396 B Phone JS
and 76,695 B initial CSS. The artifact tree is
`da21840eb2108f0098c01ccc239489ccee0db81b893cf6582cdbedcb94577cf5`.

The prior complete 113/113 Phone WebKit run predates this CSS-only selector
change and is not recorded as an exact-artifact full run. The manifest remains
`candidate=null`, `sourceDirty=true`, and `pending-memory`; formal physical
acceptance remains blocked.

### 2026-08-12 depth/copy/media authority automated closure

The replacement now has one Shell-owned retained Figure2 arch and one decode
authority. Figure2 and Proof now use complementary element masks from the same
transaction, atlas, progress, and transform: the semantic Figure2 root owns
`conceal`, the Proof compound owns `reveal`, both A/B buffers remain unmasked,
and the Shell arch stays outside both masks above the depth Ink. The successful
commit hides the retiring buffer before transition cleanup can remove masks.
A WebKit pixel probe removes only the Figure2 conceal style at mid-sweep and
observes more than 5,000 restored source pixels, so this is physical compositor
evidence rather than a computed-style-only assertion.

PH now clears presentation admission before replacement activation, accepts
only the selected generation, and immediately plus repeatedly probes that
generation until a real frame is reported or the shared packed-surface
deadline fails closed. Its Canvas is visible only while `verified` and the
leaf's admitted-generation gate are both present. Early, delayed, missing, and
retained-endpoint paths are covered without adding a Canvas, decoder, poster,
deadline, or runtime state machine.

Fresh evidence for the exact production artifact:

| Gate | Result |
| --- | --- |
| Focused Vitest | 5 files / 75 tests passed |
| Full Vitest | 177 files / 1,374 tests passed |
| Trusted touch chain | Chromium 1/1: Services → TTG → Lab → PH, each edge committed exactly once |
| Full Phone WebKit | 115 passed / 1 trusted-touch skip in one process without retry, 13.2 minutes |
| Production build | TypeScript, architecture, media, release-build, and budget gates passed |
| Phone JS / initial CSS | 665,526 B / 76,695 B; existing caps unchanged |
| Artifact tree | `d5bdfd4c36cb7012a90b8bf1ed73ebfd91ad62d76ac175b74937d93e9490083a` |

The generated manifest remains `candidate=null`, `sourceDirty=true`, and
`pending-memory` (176 files / 84,058,121 bytes). No commit, tag, push,
deployment, or candidate was created. This artifact is ready for the required
two-round physical iPhone matrix, but formal acceptance and release remain
blocked until those physical results and memory qualification pass. Figure3
sharpness remains limited by its existing 1280×720 animation source.

Playwright WebKit cannot emit a trusted swipe, so its complete run intentionally
skips only that transport-specific case. The same chain passes with trusted
Chromium touch input, and the full WebKit story traversal still covers all 60
forward/reverse segment traversals. Real Safari touch, Low Power Mode, toolbar,
background/BFCache, and exact-edge trace capture remain physical gates; this
automated result does not claim that the earlier physical freeze occurred at
`lab-ph`.

## Superseded historical record

Everything below this heading records earlier investigation and invalidated
candidates. It must not be used to select the current device-test artifact.

## Invalidated historical candidate identity

| Item | Value |
| --- | --- |
| candidate mode | detached, clean, immutable historical diagnostic source; not eligible for a passing row |
| `candidateCodeSha` | `8f3913908cba95e150d464dfab12270efe9dbdc3` |
| `productionTreeHash` | `96b664cf88e88d207596256ca3adaf6b739b11e77d5f3d2ebe60293854c895e0` |
| document build/recovery ID | `8f3913908cba95e150d464dfab12270efe9dbdc3` |
| CDN release ID | `null` — local candidate artifact; CDN/deployment not yet configured |
| release-manifest schema / qualification | schema 3 / `pending-memory` |
| manifest candidate / tag object | `null` / `null` |
| manifest `sourceCommit` | `8f3913908cba95e150d464dfab12270efe9dbdc3` |
| manifest `sourceDirty` | `false` |
| `artifactTreeSha256` | `a9586450d93e8ff4d7893e15eb51edd783379a7332d960d9260ebadeee6f9a4e` |
| release-manifest SHA-256 | `63984b8c8f5f9ee3bd660f1bda17302ef2378ad5e350edd34245e861c4af3531` |
| manifest inventory | 174 files / 83,612,514 bytes; 174/174 bytes and hashes independently verified |

`VITE_R5_DOCUMENT_BUILD_ID` and deployed recovery identity both derive from
the exact source commit. The report worktree's docs-only HEAD and its local
`dist/` are not candidate identities and must never be served during Task 13.

The artifact identity remains valid as history, but native findings later
proved incorrect shared choreography, gesture activation, native reading, and
Loader/Hero timing. It is therefore an **invalidated diagnostic candidate**.
No later retry or successful screenshot converts any row to passing. Task 12C
must close under the
[physical choreography ADR](../decisions/r5-task13-physical-choreography-correction.md)
before a replacement candidate is frozen.

## Tool and device record

| Item | Value |
| --- | --- |
| Node | `v25.6.1` |
| pnpm | `8.15.1` |
| Vite | `7.3.6` |
| Playwright | `1.61.1` |
| Chromium | `149.0.7827.55`, Playwright revision `1228` |
| WebKit | `26.5`, Playwright revision `2311` |
| iOS Simulator model/runtime | iPhone 17 Pro / iOS 26.3, UUID `114786F4-1CAD-4FDC-8892-E196E2CF8E25` |
| physical iPhone model | pending physical handoff |
| physical iOS build / Safari | pending physical handoff |
| network mode | pending each Simulator/device row |
| reduced-motion setting | pending each Simulator/device row |

## Step 13.1 build verification

The candidate worktree was bootstrapped with the frozen lockfile, then its
HEAD, detached state, clean status, and production tree hash were rechecked.
Exactly one formal build was run:

```text
pnpm -C /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-8f39139/app build
```

Result: passed. The command completed TypeScript, boolean-data, clean
architecture, homepage module boundaries, packed-alpha master, Vite, media
inventory, release-build, performance-budget, CDN-manifest, and release-
manifest gates.

| Build measurement | Result |
| --- | ---: |
| transformed modules | 256 |
| desktop JavaScript | 577,525 B |
| required desktop headroom | 4,096 B |
| actual desktop headroom | 4,107 B |
| phone JavaScript | 607,259 B |
| phone headroom | 56,293 B |
| largest lazy JavaScript | 50,892 B |
| total asset bytes | 83,463,753 B |
| largest asset | 11,002,083 B |

The manifest inventory was then recomputed from `dist/`; every listed file's
byte count and SHA-256 matched, the sorted file set matched exactly, and the
aggregate artifact hash matched `artifactTreeSha256`.

The prior Simulator attempt invalidated candidate `a4ba41f…` after exposing
missing Hero and Star Map readable-bottom fallbacks. The correction then
exposed a Figure2 transient packed-alpha repaint being promoted to a fatal
rollback. Both received deterministic regressions and focused verification;
the new source passed 174 files / 1,199 Vitest tests, 97/97 Node gate fixtures,
the Figure2 Grade A chain 10/10, and one complete 227/227 release suite before
this replacement artifact was frozen.

## Durable evidence

Historical artifact retained for diagnosis only; do not serve it for a passing
Task 13 row:

```text
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-8f39139/dist/
```

Persistent identity evidence:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task13-candidate-freeze-8f39139/
```

| Evidence | SHA-256 |
| --- | --- |
| `r5-release-manifest.json` | `63984b8c8f5f9ee3bd660f1bda17302ef2378ad5e350edd34245e861c4af3531` |
| `cdn-publish-manifest.json` | `a8da1c30c157af305a495d47cafc864f42e4fd29cebb70a4dc201a2a703c07b9` |
| `vite-manifest.json` | `3f4c1e1614f509ccb84173254ad1919964d5d992b811df397dd0ba3542081913` |
| `r5-module-provenance.json` | `ca3c08842b90a6a951ae48ccb55e60b4454619a3f7fa1e0c618e446cc9e60f13` |
| `task13-candidate-freeze-summary.json` | `ece5992e6aa5d4067ef74bf8ad127a7ebea08fbb1ab2cfe491d12f65f09a6e73` |

The evidence-directory `SHA256SUMS` verifies 5/5 entries.

## Step 13.1 identity review

```json
{
  "reviewer": "correctness",
  "findings": [],
  "residual_risks": [
    {
      "risk": "Desktop JavaScript headroom is 4,107 B, only 11 B above the enforced 4 KiB reserve; any production/configuration/lockfile change invalidates this artifact."
    },
    {
      "risk": "The local manifest is candidate-null and pending-memory with CDN disabled. It is frozen for device testing, not deploy-qualified or Release-complete."
    }
  ],
  "testing_gaps": [
    "Task 13.2 acceptance is separate from this identity review.",
    "Physical iPhone Safari and deployed compression evidence have not run."
  ]
}
```

## Task 13.2 RED discovery record

The first open of `http://127.0.0.1:4179/` displayed a black runtime fault
surface with “重试加载故事.” Safari had not been terminated and that origin had
previously served an older candidate. The page was terminated before its
fault code, failed resource, runtime generation, or proof/frame state was
captured. The screenshot is therefore valid RED evidence but insufficient to
name a production root cause.

Three controlled cold starts then terminated MobileSafari and used fresh
origins on ports 4182, 4183, and 4184. All three reached stable Hero after 15
seconds. This makes reused browsing-context state the leading hypothesis, but
does not prove it and does not convert the original row to passing.

Persistent ignored evidence is under:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task13-simulator-8f39139/
```

Its `SHA256SUMS` verifies 6/6 files. Formal Simulator and physical acceptance
is paused while discovery is batched in the
[Task 13 defect ledger](r5-phone-clean-runtime-task13-defect-ledger.md).
The frozen `8f39139` artifact remains unchanged. A separate dirty diagnostic
build removes the confirmed shared `ui-serif` font failure and exposes the
existing terminal fault code only through diagnostics mode. Native Simulator
screenshots for Services, Education, and the visible StoryNav labels are
preserved under `task13-font-diagnostic/`; they are corrective discovery
evidence, not a new candidate or a formal passing row. At that discovery
checkpoint no Task 12 or 227-case rerun was authorized. The later shared-root
batch below completed that diagnostic precondition.

## Historical Task 12C automated evidence

The prior corrective batch recorded 119/119 Node gate fixtures, 175 Vitest files /
1,227 tests, TypeScript, architecture/frozen-input checks, the complete build,
focused WebKit 20/20, and one complete 227/227 release suite in 29.1 minutes.
The build remains below the unchanged phone JavaScript hard cap at 616,101 B;
desktop JavaScript is 577,476 B and the largest lazy chunk is 50,887 B.

This does not create a candidate identity. The source is still an uncommitted
diagnostic WIP based on `34c306e…`. The corrected bounded probe reached
Hero → Pattern → Star Map → AOD → Method at the scene/status control-flow
level, including the two-stage Pattern intent. It did not sample visual
composition, animation frames, pixel contribution, or AOD playback; the AOD
snapshot was the intentional static direct-entry state. A forced
`DELETE /session/{id}/actions` release returned 200, but a subsequent native
Method-edge action produced no touch or pointer events. That is a
SafariDriver capability boundary, not a Simulator-complete result. The
continuous record, screenshot, and hashes are preserved under:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task13-simulator-bounded-20260806/
```

This record supports only the statement “Hero → Method control flow is
reachable.” It is not visual or media evidence, and it does not close Task
13.2. Task 12 remains reopened; `candidateCodeSha` remains null until a
fixed diagnostic checkpoint is committed and the trusted-touch device smoke
diagnostic is complete.

## Remaining Task 13 matrix

| Step | Status |
| --- | --- |
| 13.1R replacement candidate freeze | pending bounded native repeat and code commit |
| 13.2 iOS Simulator | paused / RED — Task 12 focused contract correction is open |
| 13.3–13.7 physical iPhone Safari | discovery pass pending device metadata and continuous recording |
| 13.8 evidence consolidation | pending |
| 13.8A deployed compression | pending deployed candidate endpoint |
| 13.9 final evidence-only commit | pending all rows passing |

The desktop JavaScript reserve is only 11 bytes above the enforced 4 KiB
headroom. Production code/configuration/lockfile changes invalidate this
artifact and require returning to Task 12. Until all remaining rows pass on
this exact artifact, `Chunk-closed` and `Release-complete` are forbidden.
