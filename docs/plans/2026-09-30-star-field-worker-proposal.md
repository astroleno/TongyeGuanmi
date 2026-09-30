# Star field background rendering

Status: user approved implementation on 2026-09-30 (“你继续做吧”). This extends the approved exact-noise caching work to a background rendering backend; it does not authorize production promotion.

Implementation is available in opt-in preview 16. Pixel comparison, failure fallback and public frame-time results are recorded in [the verification report](2026-09-30-public-performance-verification.md). Public RAF measurements are improved but retain occasional missed frames; physical-device and release-memory qualification remain unverified.

## Evidence and remaining problem

The user's current in-app page runs preview 13 (`index-BuO7e32.js`). Its retained runtime error is `Segment recovery could not identify an endpoint`. A separate, reproducible boundary-input bug allows preparation with no segment; the local fix and regression tests cover outward scrolling and preparation reversal at both story boundaries.

An isolated in-app-browser star-map page measured these requestAnimationFrame intervals over five seconds. These are main-thread animation callback measurements, not hardware presentation FPS or physical-phone measurements:

| Treatment | Median interval | p95 interval | Samples after first callback |
| --- | ---: | ---: | ---: |
| Preview 13 | 83.4 ms | 117.4 ms | 69 |
| Current local cache fix | 18.0 ms | 99.9 ms | 121 |

Temporarily pausing the original star renderer yielded a 16.7 ms median and 18.4 ms p95 over three seconds. CPU sampling attributed most active script time to gradient Perlin/fBm. Temporarily bypassing filters and caching filtered layers did not remove the remaining long frames; neither diagnostic change was retained.

The new cached desktop kernel exactly matches the previous field. It preserves resolution, noise parameters, blend order, blur radii, source plate, scene order and stage timing. It also removes the unused desktop gradient kernel from the phone dependency graph. This is a partial improvement, not final smoothness acceptance.

## Proposed module design

- Keep the existing scene, Director, layer ownership, story timing and Canvas element contracts.
- Extract the existing star painter behind a canvas/image-source adapter. The same code, noise kernels, dimensions, colors, blur passes and blend order run in a Worker on an OffscreenCanvas where supported.
- A scene-owned client transfers one finished ImageBitmap to the existing visible HTMLCanvasElement. The main thread only presents that bitmap and updates frame evidence after a real draw.
- Keep at most one render request in flight and one replaceable next request. Every request includes a scene generation and monotonic frame ID. Late, paused or disposed results must be closed and discarded.
- Preserve the last presented frame while work is pending. Source readiness alone must not acknowledge a presented frame. First-frame readiness follows the first successfully drawn worker result.
- Pausing stops requests; disposal terminates the worker and closes pending bitmaps. Worker creation, capability or runtime failures fall back to the existing main-thread painter. A failed background renderer must not strand a transition or falsely report successful presentation.
- Keep the worker backend in the desktop scene dependency graph initially, because that is the measured bottleneck. Phone retains its verified kernel; the shared pixel contract must remain identical.

## Interfaces and verification

- Client: `render({ generation, frameId, timeSeconds, strength, noiseFloor, camera, viewport })`, `pause()`, `dispose()`.
- Result: `{ generation, frameId, bitmap }`; source loading errors and render errors have explicit failure responses.
- Compare frozen-time output pixels from the current painter and worker painter at representative viewports, including blur edges and alpha, before accepting the new backend.
- Exercise worker startup failure, in-flight pause/disposal, stale generations, first-frame readiness and fallback. No acknowledgment may survive disposal or refer to an undrawn bitmap.
- Re-measure the same in-app browser and public preview, plus touch-emulated regression. Target near-60 Hz main-thread input/animation responsiveness with no star-induced >50 ms long tasks. Do not substitute successful chapter traversal for frame-time evidence.
- Verify Hero → Pattern checkpoints → Star → AOD and reverse, continuous wheel input, direction changes, and scene resource release.
- Include worker bytes and resources in existing size/memory accounting; do not raise hard budgets or hide worker cost outside them.
- Publish only an opt-in preview after verification. Production stays unchanged. Physical phone/WeChat acceptance remains separate and cannot be claimed from emulation.
