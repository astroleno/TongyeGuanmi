# R5 Phone Clean Runtime — Task 13 acceptance

- Date: 2026-08-11
- Status: **NO-GO — v31 invalidated by device-contract regressions**
- Current claim: **implementation and automated acceptance are being repaired;
  no artifact is currently authorized for formal physical-device acceptance**
- Report branch: `codex/r5-phone-clean-runtime-convergence`
- Candidate worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime`
- Candidate artifact: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/dist/`

## Invalidated v31 identity

The following identity is retained only so prior evidence remains traceable.
Correctness review on 2026-08-11 found an incorrect stable-Hero media contract,
mid-gesture native-scroll takeover, retained-media generation gaps, and other
device-visible regressions. Therefore v31 must not be used for formal acceptance.

| Item | Value |
| --- | --- |
| candidate | `react-refactor-r5-parity-repair-candidate-v31` |
| source commit | `74863ae8e4d367c4a25b2485fc57b9c56b9093bc` |
| annotated tag object | `106105c894dadabd9ed60a832017d519fb7ca81c` |
| `sourceDirty` at build | `false` |
| `artifactTreeSha256` | `ab1398081166f1e0f037f77fc5486113e5e4633ee2ffdd545ebf5619f0aca77a` |
| release-manifest SHA-256 | `5a13058eae63c4bff70d92dcea1b5f8e4ecf8a857b74dcf6e8c6e16422a50a63` |
| manifest inventory | 177 files / 84,061,503 bytes |
| manifest schema / qualification | schema 3 / `pending-memory` |
| phone JavaScript | 663,349 B / 663,552 B hard cap; 203 B headroom |

The generated authority is `dist/r5-release-manifest.json`. The branch was 22
commits ahead of its remote-tracking branch at this checkpoint, so an unpushed
or differently rebuilt copy must not replace the local manifest-bound artifact.
A later docs-only ledger commit may move branch HEAD, but it does not replace
the v31 source commit, tag, manifest, or already-built `dist/` acceptance artifact.

## Superseded v31 automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Vitest | pass | 177 files / 1,366 tests |
| Production build | pass | TypeScript, architecture, media, release-build, budget, CDN, and release-manifest gates |
| Phone portrait WebKit | pass | 108/108, one worker, 11.9 minutes |
| Complete story pressure traversal | pass | all 60 forward/reverse segment traversals, one authority, no resource growth; 3.2 minutes inside the full WebKit run |
| Source hygiene | pass | clean v31 source at build; `git diff --check` passed |

The exact WebKit command was:

```text
pnpm exec playwright test --config=playwright.release.config.ts --project=phone-portrait-webkit --workers=1
```

`app/test-results/.last-run.json` persists the final `passed` state with no
failed tests. The complete 108-test console transcript was observed during the
acceptance run but was not emitted as a standalone JSON/JUnit artifact; this is
an evidence-retention gap, not a device-test blocker.

## New candidate gate

Physical acceptance is blocked until the listed regressions are repaired and a
new immutable candidate passes the automated gates. The replacement gate uses
an explicit 650 KiB (665,600 B) phone/total raw-JS cap—2 KiB above v31's cap—to
carry the current-generation Canvas and retained-media contracts; all other
performance budgets remain unchanged. The eventual device run covers real touch traversal, normal and Low
Power Mode, toolbar changes, background/BFCache recovery, autoplay restrictions,
AOD → Method, Figure2 arch/ghosting, Brand ↔ Figure3, TTG/PH/Crane playback,
A/B flash, viewport rebound, and compositor continuity. Figure3 sharpness must
be judged against the existing 1280×720 animation source.

There is currently **no GO candidate**:

- memory qualification remains `pending-memory`;
- physical iPhone Safari evidence is not yet recorded;
- the phone JavaScript budget has only 203 B headroom, so any code or build
  change requires a new budget check and candidate identity.

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
