# R5 Performance Budget

Status: frozen budgets passed on the final pre-freeze build and hardware runs. Exact-tag identity verification remains.

Date: 2026-07-12. The values previously published for `react-refactor-r5-candidate-v3` are historical and cannot certify this repair because that tag does not contain the re-enabled transition motion, loader/Hero lifecycle, new media driver, or shell assets.

## Corrected Runtime Contract

The old report stated that Pattern froze during structural transition and Star Map started only after becoming current. That behavior is deliberately superseded:

- Pattern stays live at its existing 24fps cap whenever it is visible in Hero ↔ Pattern or Pattern ↔ Star Map, including the collapsed pause and ink stage.
- Star Map stays live at its existing 12fps cap whenever it is visible in Pattern ↔ Star Map.
- Run-scoped leases stop both renderers when hidden, reduced-motion, settled away, aborted, sought, recovered, remounted, or unmounted.
- Production ink uses the `edge-only` grade, so boundary particles remain without a scene-wide dark cover.
- Every ink run owns a fresh canvas/context; every managed timeline video releases listeners, frame callbacks, timers, and shared-driver ownership on unmount.

Passing performance by permanently freezing required animation is not permitted.

## Frozen User-Visible Budgets

| Metric | Budget | Parity-repair result |
|---|---:|---|
| desktop LCP | ≤2.5s and no worse than the accepted legacy comparison gate | pass; worst 212ms |
| mobile LCP | ≤4.0s | pass; 168ms |
| production runtime ready | ≤2.5s desktop / ≤4.0s mobile | pass; desktop worst 166.5ms, mobile 153ms |
| cold Hero presentation ready | loader + 2.7s intro completes within the accepted safety envelope | pass; desktop worst 8,588ms, mobile 8,594.1ms |
| desktop playback p95 frame interval | ≤20ms | pass; 16.8ms |
| mobile playback p95 frame interval | ≤34ms | pass; 16.8ms |
| frames >50ms | <1% | pass; 0 / 407–408 playback samples |
| cold initial transferred resources | ≤40MiB | pass; worst 28,708,064B |

LCP is measured independently from cinematic presentation readiness. Hero media remains a valid early LCP candidate under the loader overlay; the loader must not defer LCP until its 5.38s phrase sequence exits.

## Frozen Bundle Budgets

| Metric | Budget | Parity-repair result |
|---|---:|---|
| initial JS raw | ≤368,640B | pass; 356,960B |
| initial JS gzip | ≤114,688B | pass; 109,708B |
| initial CSS raw | ≤76,800B | pass; 74,028B |
| total JS raw | ≤532,480B | pass; 522,622B |
| largest lazy JS | ≤65,536B | pass; 18,801B |
| largest emitted asset | ≤16,777,216B | pass; 15,302,466B |
| total asset tree | ≤152,043,520B | pass; 139,508,560B |

The timeline-video driver remains reachable through lazy scene/transition chunks. SceneLayer unmount cleanup uses element-owned disposal without importing the driver into the initial production graph. The harness-only dark grade remains behind the existing lazy harness boundary.

## Frozen GPU, Memory, And Disposal Budgets

| Metric | Budget | Parity-repair result |
|---|---:|---|
| browser process-tree peak RSS | ≤1,500,000,000B | pass; 1,461,190,656B |
| GPU process peak RSS | ≤536,870,912B | pass; 344,408,064B |
| renderer process peak RSS | ≤1,073,741,824B | pass; 785,072,128B |
| JS heap | peak ≤192MiB; settled ≤90% of peak | pass; 41,857,578B → 17,873,726B (42.7%) |
| mounted layers at settled holds | ≤3 | pass; max 3 |
| WebGL contexts at settled holds | ≤1 | pass; max 1 |
| disposed Contact snapshot | ≤3 layers, ≤1 WebGL, ≤4 paused videos | pass; 2 layers, 0 WebGL, 2 paused videos |
| lifecycle release evidence | at least one retired canvas and video; no managed callback/lease leak | pass; 3 canvases and 2 videos released in the performance path |

The stress sample must overlap Pattern, Star Map, and active ink, then traverse all 18 holds forward and reverse, wait at both endpoints, and record renderer/GPU/process memory plus Stage disposal diagnostics.

## Final Evidence

The table records the final build budget JSON, three hardware frame/LCP samples (two desktop Chromium, one mobile Chromium), and `artifacts/react-refactor/r5-parity-repair-candidate/r5-process-memory.json`. Trace, video, screenshot capture, and manual visual review were disabled for this gate.
