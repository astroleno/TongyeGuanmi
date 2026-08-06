# R5 Phone Clean Runtime — Task 13 discovery defect ledger

- Date opened: 2026-08-03
- Candidate under discovery: `8f3913908cba95e150d464dfab12270efe9dbdc3`
- Status: **Task 12 reopened / NO-GO / corrective focused verification in
  progress / Task 13.2 paused**
- Release claim: **NO-GO; no active passing candidate**

The `8f39139…` artifact remains immutable as historical evidence. Development
uses the report worktree as a diagnostic WIP, but no new candidate is frozen
until every confirmed root passes the complete focused batch. The governing
decision is the
[Task 13 physical choreography ADR](../decisions/r5-task13-physical-choreography-correction.md).

## Active findings

### D13-001 — cold root displayed the runtime fault surface

| Field | Record |
| --- | --- |
| category | startup / Loader |
| severity | P1 |
| observed artifact | exact `8f39139` candidate, `sourceDirty=false` |
| first observation | reused Safari browsing context on `http://127.0.0.1:4179/`; black runtime fault surface with “重试加载故事” |
| formal disposition | RED; the retry-to-Hero result is not an acceptance pass |
| isolated reproduction | 0/3 faults after terminating MobileSafari and using fresh origins `4182`, `4183`, `4184` |
| leading hypothesis | reuse of the prior Safari document/cache/session lineage; not proven |
| missing evidence | first fault code, failed module URL/request, transaction generation, proof/frame snapshot, Safari console/network |
| production action | diagnostics-only `data-phone-fault-code`; no runtime recovery change until a captured failure identifies the root cause |

Persistent ignored evidence:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task13-simulator-8f39139/
```

Its `SHA256SUMS` currently verifies 6/6 diagnostic records, including the
original fault screenshot and all three isolated cold-root screenshots.

Future cold-root capture must record the current URL plus
`data-phone-revision` and `data-phone-fault-code` before retrying. The latter
is omitted outside diagnostics mode and is populated only by an actual
terminal `snapshot.fault.code`; it is not a new recovery path or telemetry
system.

### D13-002 — shared traditional-font fallback broke iOS Chinese glyphs

| Field | Record |
| --- | --- |
| category | viewport / safe-area |
| severity | P1 |
| observed artifact | exact `8f39139` candidate in native iPhone 17 Pro Simulator Safari |
| symptom | Education Chinese text rendered as question-mark boxes and widened the page; the shared token also serves Services and StoryNav |
| confirmed root cause | `--font-traditional` included `ui-serif`; removing only that generic family restored the existing Songti/STSong chain |
| regression | typography contract requires the exact approved stack and rejects `ui-serif` in this token |
| diagnostic fix | removed `ui-serif` once in `styles.css`; no per-scene overrides |
| focused verification | 25/25 Vitest, TypeScript, cutover architecture, complete build |
| native verification | direct Services and Education screenshots show correct Chinese glyphs; visible StoryNav brand/menu/booking labels are also correct |
| formal disposition | fixed in dirty diagnostic build; Task 13.2 remains RED and no replacement candidate is frozen |

Persistent ignored evidence:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task13-font-diagnostic/
```

The directory preserves the original failure, the temporary browser override,
the two source-level diagnostic screenshots, a machine-readable summary, and
SHA-256 hashes for the four screenshots. The post-fix screenshots visually
show no clipping; they do not claim a new DOM `scrollWidth` measurement.

### D13-003 — one undifferentiated progress destroyed segment choreography

| Field | Record |
| --- | --- |
| category | media / Canvas / presentation |
| severity | P0 |
| observed artifact | exact `8f39139` candidate under native Simulator gestures |
| symptom | Hero → Pattern switched only at commit; Pattern lacked its full-screen hold; Star/Perlin remained covered; AOD played before its own outgoing segment and reset at commit |
| confirmed root cause | runtime broadcast the same progress to source, target, and effect while the projector exposed one whole plane; segment-specific endpoint holds, clocks, opacity, and Ink ownership were absent |
| accepted correction | one exhaustive 15-segment choreography ledger; runtime leg projection; projector-owned complementary Ink boundary and semantic foreground; reducer remains the only authority |
| regression set | exhaustive finite/bounded map, Hero/Pattern/Star/AOD order, reverse ownership, plane clips/masks/stack, per-leg runtime commands |
| current disposition | corrective WIP; choreography projection and a real intermediate-Ink pixel oracle are under focused verification. No browser or native closure claim remains. |

### D13-004 — touch host adapter broke activation and native reading

| Field | Record |
| --- | --- |
| category | state machine / gesture |
| severity | P0 |
| observed artifact | exact `8f39139` candidate under native Simulator gestures |
| symptom | warm Star → AOD entered `awaiting-media-activation`; Method had native scroll range but an upward gesture left `scrollY=0` and started the next story segment |
| confirmed root cause | story intent was delayed until gesture end, adjacent manifest prewarm had no runtime consumer, and Method lacked native-document ownership plus a fresh edge latch |
| accepted correction | begin once on directional `touchmove`; consume target activation on that same gesture stack; prewarm adjacent module/metadata closures; keep native reading pixels unprevented and require a new outward edge gesture. AOD cold direct entry is a static poster exception with no autoplay or CTA; its video activates only on the normal AOD → Method outgoing gesture. |
| exclusions | no global media unlock sweep, no legacy runtime, no second input authority |
| current disposition | corrective WIP; continuous segment CTA is forbidden, source-clock activation and native reading edge handoff are under focused verification. No bounded Simulator claim remains. |

### D13-005 — Loader and Hero had independent visible clocks

| Field | Record |
| --- | --- |
| category | startup / Loader |
| severity | P1 |
| observed artifact | exact `8f39139` candidate |
| symptom | Hero progressed to completion behind the opaque Loader; pre-hydration text flashed before the React Ink Loader |
| confirmed root cause | the static and React loaders both authored text, and Loader exit had no causal command into the Hero entrance |
| accepted correction | textless static safety cover; React Loader is the sole text/Ink author; cold Hero settles at zero; Loader exit starts the one visible entrance; input remains disabled until hidden |
| current disposition | corrective WIP; the Loader-hidden/stable/interaction and visible Hero-start contracts are under focused verification. No native acceptance claim remains. |

## Task 12C corrective verification — 2026-08-04

The centralized correction remains constrained to the existing reducer,
runtime, input authority, projector, and core-file boundary. The following
historical verification batch is retained for audit; it does not close the
current findings:

- affected deterministic set: 23 files / 260 tests;
- Node gate fixtures: 119/119;
- full Vitest: 175 files / 1,227 tests;
- TypeScript, clean architecture, semantic-boolean, packed-alpha, frozen-input,
  and `git diff --check`;
- complete build: desktop JavaScript 577,476 B, phone JavaScript 616,101 B,
  largest lazy JavaScript 50,887 B, and the unchanged 663,552-byte hard cap;
- Loader timing plus Hero ↔ Pattern ↔ Star ↔ AOD focused WebKit repeats:
  20/20 total;
- corrected Contact adjacent-prewarm oracle: 10/10 Chromium;
- final complete release suite: 227/227 in 29.1 minutes with one worker and
  `--max-failures=1`.

The first broad attempt stopped at its first failure after 107 passes. Its
trace showed only the manifest-authorized adjacent module prewarm: Contact had
no mounted video, decoder, Canvas, or WebGL owner. The stale test-only oracle
was corrected, passed 10/10, and only then was the final complete suite run.
No production behavior was changed for that oracle.

Persistent ignored evidence is under:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/raw/task12c-choreography-closure-20260803/
```

Its `SHA256SUMS` verifies 9/9 files, including the complete release log,
Playwright final status, structured command/result summary, and bounded
Simulator screenshots.

The Simulator record is deliberately partial. A clean cold root reached Hero;
the preserved Method first-edge probe reached `scrollY=963/maxScrollY=963`
without leaving stable state; and a fresh trusted-touch probe did not turn the
first Method gesture into a story transition. The sequential probe reached
stable Pattern and Star Map without an activation CTA, then SafariDriver's
native action channel stalled before Star → AOD and the reverse repeat. That
driver stall is neither recorded as a product failure nor promoted to a pass.

The report worktree is based on `34c306ed2c324256dcb81a9c5f47dd3a6b3b258d`,
remains intentionally dirty, and has no replacement `candidateCodeSha`.
Task 13 stays paused until the bounded native repeat completes and the code is
committed as one replacement candidate.

## Discovery intake

Record one continuous physical-device screen capture and append every symptom
before changing production. Each entry must include:

```text
ID and timestamp in recording
iPhone model
iOS build and Safari version
URL / route / scene / direction
expanded or collapsed toolbar
orientation and reduced-motion state
gesture or lifecycle action
visible symptom
runtime status/fault code if available
network/media failure if available
reproduction count
```

Group entries under exactly one primary root-cause family:

1. startup / Loader;
2. viewport / safe-area;
3. state machine / gesture;
4. media / Canvas / chunk.

Do not create a production fix per visible symptom. One confirmed root cause
gets one deterministic regression and one focused fix. During development run
only the affected unit/integration/browser rows. After all ledger entries pass
on one diagnostic build, run TypeScript, architecture and budget gates, full
Vitest, and exactly one complete 227-case release suite. Freeze only that one
replacement candidate and restart Task 13 from cold `/`.

## Pending physical discovery metadata

The user has reported multiple physical-device problems, but the following
identity/evidence is still required before those symptoms can be classified:

- physical iPhone model;
- iOS build and Safari version;
- one continuous discovery recording with timestamps;
- concise symptom list mapped to timestamps.

No placeholder in this section is treated as a confirmed defect or a passing
Task 13 row.
