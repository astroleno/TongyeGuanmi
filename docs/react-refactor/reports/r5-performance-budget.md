# R5 Performance Budget

Status: candidate-v3 pre-freeze build and three fresh-browser process-memory profiles pass. Exact identity-bound memory and final exact-tag E2E remain external post-freeze evidence.

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

| Metric | Budget | Historical candidate-v2 record |
|---|---:|---|
| desktop LCP | ≤2.5s and no worse than the accepted comparison gate | 188ms |
| mobile LCP | ≤4.0s | 184ms |
| production runtime ready | ≤2.5s desktop / ≤4.0s mobile | 182.7ms desktop / 147.3ms mobile |
| cold Hero presentation ready | loader + 2.7s intro inside the accepted safety envelope | 8,597ms desktop / 8,592.8ms mobile |
| desktop steady playback p95 frame interval | ≤20ms | 16.8ms full traversal / 17.5ms focused aggregate |
| mobile steady playback p95 frame interval | ≤34ms | 16.8ms full traversal / 18.2ms focused aggregate |
| frames >50ms | <1% | full traversal 0 / 407 on both; focused 2 / 759 desktop and 2 / 758 mobile |
| cold initial transferred resources | ≤40MiB | 29,895,224B |

LCP is independent from cinematic presentation readiness. Hero media remains an early LCP candidate under the loader overlay; the loader must not defer LCP until its 5.38s phrase clock exits.

## Focused Direction And Ink Profile

| Path | Desktop first decode / activation | Desktop p95 | Mobile first decode / activation | Mobile p95 |
|---|---:|---:|---:|---:|
| TTG first forward | 93ms | 17.5ms | 128ms | 18.2ms |
| TTG same-run reverse | 147ms | 17.8ms | 146ms | 17.8ms |
| Figure2 native reverse | 99ms | 16.8ms | 116ms | 16.8ms |
| AOD reverse | 434ms | 17.3ms | 418ms | 18.2ms |
| horizontal Ink | 114ms | 18.1ms | 117ms | 18.2ms |

The aggregate desktop sample contained 759 intervals at p95 17.5ms with two intervals over 50ms (0.2635%). The aggregate mobile sample contained 758 intervals at p95 18.2ms with two intervals over 50ms (0.2639%). Both remain below the frozen 1% long-frame budget.

## Bundle Budgets

| Metric | Budget | Current clean branch build |
|---|---:|---:|
| initial JS raw | ≤368,640B | 361,700B |
| initial JS gzip | ≤114,688B | 111,012B |
| initial CSS raw | ≤76,800B | 74,613B |
| total JS raw | ≤581,632B | 575,104B |
| largest lazy JS | ≤65,536B | 24,997B |
| loader Ink lazy JS | ≤16,384B | 13,534B |
| largest emitted asset | ≤16,777,216B | 15,302,466B |
| total asset tree | ≤163,577,856B | 159,670,645B |

The initial JS/CSS, gzip, largest-lazy, and largest-asset caps are unchanged. Two narrow rebaselines are explicit:

- total JS: 520KiB → 568KiB because the old result was 40B below its cap before adding required gesture, presented-frame media, loader lifecycle, and typed Ink failure contracts; the initial entry cap stays unchanged;
- total asset tree: 145MiB → 156MiB because native Figure2 reverse must ship the direction-specific assets instead of seek-storming forward media; cold transfer and largest-asset caps stay unchanged.

`verify-performance-budgets.mjs` now requires exactly one `loader-ink-reveal-*.js` lazy chunk and enforces its dedicated 16KiB cap. `verify-release-build.mjs` verifies shader markers are in that lazy chunk and absent from the initial entry.

## GPU, Memory, And Disposal Budgets

| Metric | Budget | Candidate-v3 pre-freeze record |
|---|---:|---|
| browser process-tree peak RSS | ≤1,500,000,000B | three passes: 1,474,232,320B; 1,472,495,616B; 1,473,265,664B |
| GPU process peak RSS | ≤536,870,912B | 355,254,272B latest |
| renderer process peak RSS | ≤1,073,741,824B | 827,064,320B latest |
| JS heap | peak ≤192MiB; settled ≤90% of peak | 31,534,286B peak; 13,335,043B settled latest |
| mounted layers at settled holds | ≤3 | 3 |
| WebGL contexts at settled holds | ≤1 | 1 |
| disposed Contact snapshot | ≤3 layers, ≤1 WebGL, ≤4 paused videos | 2 layers, 0 WebGL, 2 videos |
| lifecycle release evidence | retired canvas and video; no managed callback/lease leak | 3 canvases and 2 videos released; pass |

Each memory run traversed all 18 holds forward and reverse with parked Figure2 reverse surfaces, TTG/PH direction changes, and the 128-sample Ink contour. Candidate-v2 exact-tag runs failed at `1,527,169,024B` and `1,575,190,528B`. Candidate-v3 adds exact TTG terminal ownership, precomposited static layers, inactive decoder reset, and disposed-source release; three consecutive fresh-browser preflights now pass without changing the budget. The final authoritative value is regenerated with exact v3 tag/commit/artifact identity.

## Evidence Rule

Trace, video, screenshots, and automated aesthetic acceptance remain disabled. The pre-freeze values above are stability evidence, not a substitute for the schema-3 exact-tag run. Exact-tag identity and final browser evidence are attached to the external handoff; a failed RSS gate cannot be waived or uploaded.
