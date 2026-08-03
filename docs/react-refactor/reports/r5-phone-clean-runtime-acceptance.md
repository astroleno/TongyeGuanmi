# R5 Phone Clean Runtime — Task 13 acceptance

- Date: 2026-08-03
- Status: **Step 13.1 candidate identity frozen; Steps 13.2–13.9 pending**
- Current claim: **`Chunk-contract-complete`; not `Release-complete`**
- Report branch: `codex/r5-phone-clean-runtime-convergence`
- Candidate worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-a4ba41f`

## Frozen candidate identity

| Item | Value |
| --- | --- |
| candidate mode | detached, clean, immutable production source |
| `candidateCodeSha` | `a4ba41feaf76fb2f40afbcf222f1565216fac648` |
| `productionTreeHash` | `5a4d8cee502155f71c226931b176ee1bc7f75f1fe2bfe43a23e1f93e3f9f60a3` |
| document build/recovery ID | `a4ba41feaf76fb2f40afbcf222f1565216fac648` |
| CDN release ID | `null` — local candidate artifact; CDN/deployment not yet configured |
| release-manifest schema / qualification | schema 3 / `pending-memory` |
| manifest candidate / tag object | `null` / `null` |
| manifest `sourceCommit` | `a4ba41feaf76fb2f40afbcf222f1565216fac648` |
| manifest `sourceDirty` | `false` |
| `artifactTreeSha256` | `f7f7446dc4727755745184fad111036c516974de2cdbed3b02a7d59f5d8ae293` |
| release-manifest SHA-256 | `7e02bfe28574715006c9adcff4a3552e8f9bcf02ca52f9c214a90efcdba079c8` |
| manifest inventory | 174 files / 83,612,584 bytes; 174/174 bytes and hashes independently verified |

`VITE_R5_DOCUMENT_BUILD_ID` and deployed recovery identity both derive from
the exact source commit. The report worktree's docs-only HEAD and its local
`dist/` are not candidate identities and must never be served during Task 13.

## Tool and device record

| Item | Value |
| --- | --- |
| Node | `v25.6.1` |
| pnpm | `8.15.1` |
| Vite | `7.3.6` |
| Playwright | `1.61.1` |
| Chromium | `149.0.7827.55`, Playwright revision `1228` |
| WebKit | `26.5`, Playwright revision `2311` |
| iOS Simulator model/runtime | pending Step 13.2 |
| physical iPhone model | pending physical handoff |
| physical iOS build / Safari | pending physical handoff |
| network mode | pending each Simulator/device row |
| reduced-motion setting | pending each Simulator/device row |

## Step 13.1 build verification

The candidate worktree was bootstrapped with the frozen lockfile, then its
HEAD, detached state, clean status, and production tree hash were rechecked.
Exactly one formal build was run:

```text
pnpm -C /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-a4ba41f/app build
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
| phone JavaScript | 607,339 B |
| phone headroom | 56,213 B |
| largest lazy JavaScript | 50,892 B |
| total asset bytes | 83,463,823 B |
| largest asset | 11,002,083 B |

The manifest inventory was then recomputed from `dist/`; every listed file's
byte count and SHA-256 matched, the sorted file set matched exactly, and the
aggregate artifact hash matched `artifactTreeSha256`. No Task 12 Playwright or
227-case suite was rerun because the frozen candidate source did not change.

## Durable evidence

Candidate artifact to serve for every remaining Task 13 row:

```text
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-a4ba41f/dist/
```

Persistent identity evidence:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task13-candidate-freeze/
```

| Evidence | SHA-256 |
| --- | --- |
| `r5-release-manifest.json` | `7e02bfe28574715006c9adcff4a3552e8f9bcf02ca52f9c214a90efcdba079c8` |
| `cdn-publish-manifest.json` | `e7cb8e3a8ab236620b051a92633d71c45fccd692c451b88a556e03d6f009aa7a` |
| `vite-manifest.json` | `484343bb7f3748982f71dd39fbce42e883de16a4328b1fec30ddaf86067f180d` |
| `r5-module-provenance.json` | `acb35668991820475ed41c5b9ef82d3138b6cf3d17fe3d00bd69df46d6c087c4` |
| `task13-candidate-freeze-summary.json` | `688b200a02844be00613f2073315024a37477506100f26d22b7301d07ca41649` |

The evidence-directory `SHA256SUMS` verifies 5/5 entries.

## Step 13.1 correctness review

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
    "Task 13.2 iOS Simulator evidence has not run.",
    "Physical iPhone Safari and deployed compression evidence have not run."
  ]
}
```

## Remaining Task 13 matrix

| Step | Status |
| --- | --- |
| 13.2 iOS Simulator | pending |
| 13.3–13.7 physical iPhone Safari | pending user/device handoff |
| 13.8 evidence consolidation | pending |
| 13.8A deployed compression | pending deployed candidate endpoint |
| 13.9 final evidence-only commit | pending all rows passing |

The desktop JavaScript reserve is only 11 bytes above the enforced 4 KiB
headroom. Production code/configuration/lockfile changes invalidate this
artifact and require returning to Task 12. Until all remaining rows pass on
this exact artifact, `Chunk-closed` and `Release-complete` are forbidden.
