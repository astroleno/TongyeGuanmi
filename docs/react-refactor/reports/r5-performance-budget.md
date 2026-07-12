# R5 Performance Budget

Status: implementation build budgets pass; final hardware frame, transfer, process-memory, and exact-candidate evidence is pending the candidate-v2 qualification run.

Date: 2026-07-13. Earlier values belong to superseded source and are audit history only.

## Corrected Runtime Contract

- Pattern remains live at its existing 24fps cap whenever visible; Star Map remains live at 12fps whenever visible. Run-scoped leases stop both when hidden, reduced, aborted, sought, recovered, or unmounted.
- Loader Ink is a separate lazy chunk. The initial entry owns only the sequence/controller boundary and does not contain the text-mask/FBM/droplet shader.
- Figure2 native reverse adds two direction-specific WebM assets. They remain lazy and parked metadata-only until the owning leg prepares them.
- TTG/PH leg clocks start only after a fixed direction-correct frame is presented; first-decode wait is measured separately from steady playback.
- Horizontal Ink uses one bounded 128-sample contour and one upload per revision. It captures no scene texture/snapshot/SVG and production cover alpha remains zero.
- Every motion lease, media callback, canvas, WebGL context, timer, and listener is disposed by its run/scene owner.

Passing performance by freezing required animation, skipping presented-frame readiness, or hiding a seam with the dark grade is forbidden.

## User-Visible Budgets

| Metric | Budget | Candidate-v2 record |
|---|---:|---|
| desktop LCP | ≤2.5s and no worse than the accepted comparison gate | pending final hardware run |
| mobile LCP | ≤4.0s | pending final hardware run |
| production runtime ready | ≤2.5s desktop / ≤4.0s mobile | pending final hardware run |
| cold Hero presentation ready | loader + 2.7s intro inside the accepted safety envelope | pending final hardware run |
| desktop steady playback p95 frame interval | ≤20ms | pending final focused/full run |
| mobile steady playback p95 frame interval | ≤34ms | pending final focused/full run |
| frames >50ms | <1% | pending final focused/full run |
| cold initial transferred resources | ≤40MiB | pending final run |

LCP is independent from cinematic presentation readiness. Hero media remains an early LCP candidate under the loader overlay; the loader must not defer LCP until its 5.38s phrase clock exits.

## Bundle Budgets

| Metric | Budget | Current clean branch build |
|---|---:|---:|
| initial JS raw | ≤368,640B | 360,219B |
| initial JS gzip | ≤114,688B | 110,570B |
| initial CSS raw | ≤76,800B | 74,875B |
| total JS raw | ≤581,632B | 564,097B |
| largest lazy JS | ≤65,536B | 24,997B |
| loader Ink lazy JS | ≤16,384B | 13,534B |
| largest emitted asset | ≤16,777,216B | 15,302,466B |
| total asset tree | ≤163,577,856B | 159,599,730B |

The initial JS/CSS, gzip, largest-lazy, and largest-asset caps are unchanged. Two narrow rebaselines are explicit:

- total JS: 520KiB → 568KiB because the old result was 40B below its cap before adding required gesture, presented-frame media, loader lifecycle, and typed Ink failure contracts; the initial entry cap stays unchanged;
- total asset tree: 145MiB → 156MiB because native Figure2 reverse must ship the direction-specific assets instead of seek-storming forward media; cold transfer and largest-asset caps stay unchanged.

`verify-performance-budgets.mjs` now requires exactly one `loader-ink-reveal-*.js` lazy chunk and enforces its dedicated 16KiB cap. `verify-release-build.mjs` verifies shader markers are in that lazy chunk and absent from the initial entry.

## GPU, Memory, And Disposal Budgets

| Metric | Budget | Candidate-v2 record |
|---|---:|---|
| browser process-tree peak RSS | ≤1,500,000,000B | pending final run |
| GPU process peak RSS | ≤536,870,912B | pending final run |
| renderer process peak RSS | ≤1,073,741,824B | pending final run |
| JS heap | peak ≤192MiB; settled ≤90% of peak | pending final run |
| mounted layers at settled holds | ≤3 | pending final run |
| WebGL contexts at settled holds | ≤1 | pending final run |
| disposed Contact snapshot | ≤3 layers, ≤1 WebGL, ≤4 paused videos | pending final run |
| lifecycle release evidence | retired canvas and video; no managed callback/lease leak | pending final run |

The memory run must traverse all 18 holds forward and reverse with parked Figure2 reverse surfaces, TTG/PH direction changes, and the 128-sample Ink contour, then wait at both endpoints before recording process and Stage disposal diagnostics.

## Evidence Rule

Trace, video, screenshots, and automated aesthetic acceptance remain disabled. Final values must be generated from the exact candidate-v2 source; a host-jittered sample may be invalidated only with the reason recorded and that exact gate repeated.
