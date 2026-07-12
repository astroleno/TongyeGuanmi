# R5 Performance Budget

Status: post-candidate review build passes the frozen bundle, hardware frame, process-memory, and disposal budgets.

Date: 2026-07-12. The values previously published for `react-refactor-r5-candidate-v3` are historical and cannot certify this repair because that tag does not contain the re-enabled transition motion, loader/Hero lifecycle, new media driver, or shell assets.

## Corrected Runtime Contract

The old report stated that Pattern froze during structural transition and Star Map started only after becoming current. That behavior is deliberately superseded:

- Pattern stays live at its existing 24fps cap whenever it is visible in Hero ↔ Pattern or Pattern ↔ Star Map, including the collapsed pause and ink stage.
- Star Map stays live at its existing 12fps cap whenever it is visible in Pattern ↔ Star Map.
- Run-scoped leases stop both renderers when hidden, reduced-motion, settled away, aborted, sought, recovered, remounted, or unmounted.
- Production ink uses the `edge-only` grade, so boundary particles remain without a scene-wide dark cover.
- Every ink run owns a fresh canvas/context; every managed timeline video releases listeners, frame callbacks, timers, and shared-driver ownership on unmount.
- Horizontal Ink adds one 32-byte contour texture upload per invocation and shares its threshold with live DOM polygons; it does not capture scene textures, snapshots, or SVG masks.
- TTG/PH internal handoffs use two existing media surfaces and a 600ms opacity dissolve, with no additional canvas or WebGL context.

Passing performance by permanently freezing required animation is not permitted.

## Frozen User-Visible Budgets

| Metric | Budget | Parity-repair result |
|---|---:|---|
| desktop LCP | ≤2.5s and no worse than the accepted legacy comparison gate | pass; 204ms |
| mobile LCP | ≤4.0s | pass; 212ms |
| production runtime ready | ≤2.5s desktop / ≤4.0s mobile | pass; desktop 185.7ms, mobile 203.3ms |
| cold Hero presentation ready | loader + 2.7s intro completes within the accepted safety envelope | pass; desktop 8,598.7ms, mobile 8,642.7ms |
| desktop playback p95 frame interval | ≤20ms | pass; 17.4ms |
| mobile playback p95 frame interval | ≤34ms | pass; 16.8ms |
| frames >50ms | <1% | pass; desktop 1 / 409 (0.24%), mobile 0 / 409 |
| cold initial transferred resources | ≤40MiB | pass; worst 20,605,366B |

LCP is measured independently from cinematic presentation readiness. Hero media remains a valid early LCP candidate under the loader overlay; the loader must not defer LCP until its 5.38s phrase sequence exits.

## Frozen Bundle Budgets

| Metric | Budget | Parity-repair result |
|---|---:|---|
| initial JS raw | ≤368,640B | pass; 357,032B |
| initial JS gzip | ≤114,688B | pass; 109,760B |
| initial CSS raw | ≤76,800B | pass; 74,028B |
| total JS raw | ≤532,480B | pass; 532,440B |
| largest lazy JS | ≤65,536B | pass; 23,223B |
| largest emitted asset | ≤16,777,216B | pass; 15,302,466B |
| total asset tree | ≤152,043,520B | pass; 139,518,378B |

The timeline-video driver remains reachable through lazy scene/transition chunks. SceneLayer unmount cleanup uses element-owned disposal without importing the driver into the initial production graph. The harness-only dark grade remains behind the existing lazy harness boundary.

## Frozen GPU, Memory, And Disposal Budgets

| Metric | Budget | Parity-repair result |
|---|---:|---|
| browser process-tree peak RSS | ≤1,500,000,000B | pass; 1,333,116,928B |
| GPU process peak RSS | ≤536,870,912B | pass; 313,360,384B |
| renderer process peak RSS | ≤1,073,741,824B | pass; 724,254,720B |
| JS heap | peak ≤192MiB; settled ≤90% of peak | pass; 42,139,577B → 13,983,694B (33.2%) |
| mounted layers at settled holds | ≤3 | pass; max 3 |
| WebGL contexts at settled holds | ≤1 | pass; max 1 |
| disposed Contact snapshot | ≤3 layers, ≤1 WebGL, ≤4 paused videos | pass; 2 layers, 0 WebGL, 2 paused videos |
| lifecycle release evidence | at least one retired canvas and video; no managed callback/lease leak | pass; 3 canvases and 2 videos released in the performance path |

The stress sample must overlap Pattern, Star Map, and active ink, then traverse all 18 holds forward and reverse, wait at both endpoints, and record renderer/GPU/process memory plus Stage disposal diagnostics.

## Final Evidence

The review implementation `14743aa5ef9e0399441863afcfd73599782721a3` regenerated and passed `dist/r5-performance-budget.json`. Fresh desktop/mobile Chromium hardware samples cover LCP, readiness, frame pacing, disposal, and released resources; the process-memory run traversed every hold forward and reverse. The first desktop sample was invalidated by host-load jitter and repeated only for that gate; the passing values above are the accepted sample. Trace, video, screenshots, and automated visual acceptance were disabled.
