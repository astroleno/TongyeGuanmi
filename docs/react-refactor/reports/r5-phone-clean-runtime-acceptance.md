# R5 Phone Clean Runtime — Task 13 acceptance

- Date: 2026-08-03
- Status: **Step 13.2 RED; diagnostic discovery in progress; formal acceptance paused**
- Current claim: **`Chunk-contract-complete`; not `Release-complete`**
- Report branch: `codex/r5-phone-clean-runtime-convergence`
- Diagnostic candidate worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-8f39139`

## Frozen candidate identity

| Item | Value |
| --- | --- |
| candidate mode | detached, clean, immutable production source |
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

The frozen identity remains valid, but identity is not an acceptance result.
The first Simulator observation displayed the runtime fault surface and
therefore changed this artifact's disposition to **diagnostic candidate**.
No later retry or successful Hero screenshot converts that row to passing.

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

Candidate artifact to serve for every remaining Task 13 row:

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
Production remains unchanged and no Task 12 or 227-case rerun is authorized
until the discovery ledger is complete and root causes are confirmed.

## Remaining Task 13 matrix

| Step | Status |
| --- | --- |
| 13.2 iOS Simulator | RED — discovery incomplete; formal rows paused |
| 13.3–13.7 physical iPhone Safari | discovery pass pending device metadata and continuous recording |
| 13.8 evidence consolidation | pending |
| 13.8A deployed compression | pending deployed candidate endpoint |
| 13.9 final evidence-only commit | pending all rows passing |

The desktop JavaScript reserve is only 11 bytes above the enforced 4 KiB
headroom. Production code/configuration/lockfile changes invalidate this
artifact and require returning to Task 12. Until all remaining rows pass on
this exact artifact, `Chunk-closed` and `Release-complete` are forbidden.
