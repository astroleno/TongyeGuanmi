# R5 Phone Clean Runtime — Task 13 discovery defect ledger

- Date opened: 2026-08-03
- Candidate under discovery: `8f3913908cba95e150d464dfab12270efe9dbdc3`
- Status: **Task 13.2 RED / diagnostic candidate / formal acceptance paused**
- Release claim: **Task 12 remains `Chunk-contract-complete`; Task 13 is not complete**

This ledger batches Simulator and physical-iPhone discovery before another
production change or expensive Task 12 closure. The current artifact remains
immutable. Development may use a separate diagnostic build, but no new
candidate is frozen until every discovered issue is grouped by root cause and
the complete batch passes focused verification.

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
