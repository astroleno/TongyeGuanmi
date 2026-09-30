# Smooth story runtime

User authorization: optimize the existing phone and desktop experience for smooth scrolling, including assets, prewarming, lazy loading, and public-network testing. Preserve all authored scenes, copy, transparency, and transitions. Public preview deployment is authorized by the follow-up request; production cutover and Git publication are not included.

## Full optimization follow-up

- Media: tune Hero/Figure2 packed H.264 compression while keeping short GOPs, dimensions, frame counts, alpha, and existing quality thresholds. Generate deterministic phone image derivatives for oversized backgrounds, posters and foregrounds; desktop masters remain unchanged. Track every derivative in the frozen inventory with dimensions and hashes.
- Loading: retain chapter-based lazy modules and the current transaction/readiness interfaces. Make optional image prewarming low-priority, sequential, network-aware, and bounded by decoded bytes as well as count. Required scene preparation must still load on slow connections. Avoid speculative media activation or a new animation authority.
- Memory: let phone Pattern consume a phone-sized background and release shared decoded layer artwork when the last renderer is disposed. Keep caches bounded instead of assuming compressed bytes describe memory cost.
- Verification: replace the misleading four-image-only first-scroll accounting with device-specific media budgets; add reproducible browser evidence for actual cold requests, future chapter deferral, warm-cache reuse, weak-network behavior, and full forward/reverse navigation. Existing hard limits must not increase.
- Public testing: publish an explicitly unqualified preview with an artifact digest and isolated opt-in routing on the existing site/CDN. The normal homepage stays on its current release. Verify HTTPS, MIME, CORS, byte ranges, cache headers, cold and throttled mobile/desktop interaction. Record unavailable physical-device coverage honestly.

## Design

- Keep the current phone/desktop shells and scene ownership. Separate phone animation-only snapshots from structural React subscriptions; imperative scene handles remain the frame renderer.
- Warm adjacent scene images through scene modules and a bounded shared image cache. Decode failures must be retryable, cancellation must not poison a shared request, and CORS mode must match canvas consumers.
- Preserve the star field's exact noise function while caching its small hash lattices per frame and reusing pixel buffers. Release asynchronous image work and canvases on disposal.
- Avoid redundant video texture uploads while retaining explicit repaint and presented-frame evidence. Preserve cross-origin canvas access.
- Retain authored chapter/stage navigation and the existing video seek driver. Quantize seek targets to source frames and shorten video keyframe intervals to bound decoder work, while preserving exact preparation and endpoint commits. Do not add a second smooth-scroll controller such as Lenis.
- Give native reading a single document scroll owner. Nested body/root containers must not consume touch or wheel input before it reaches the document.
- Unregister exact scene leases during React teardown, retain preparation activation across a remount, and keep rollback presentation independent of a retired segment effect.

## Acceptance

- Current scene stays usable through adjacent media preparation; a failed preparation can retry without a permanent blocked state.
- Frame-only progress does not render the React shell; visibility, lifecycle, stage boundaries and errors still publish immediately.
- Star noise matches the prior algorithm numerically, including negative coordinates and changing seeds; cache memory remains bounded.
- Forward/reverse video frames retain alpha and correct endpoints; no overlapping seek queue or hidden media work remains.
- Relevant unit tests, architecture checks, type checks, lint and production build pass without raising existing budgets. Browser validation covers phone touch and desktop wheel, forward/reverse transitions, reading and recovery. Physical WeChat validation is reported separately if unavailable.

## Progress

- Diagnosis completed against release `12d4686`: delayed images, preparation timeouts, blocked input, main-thread noise and per-frame state work.
- Implemented frame-only subscriptions on both shells, bounded image prewarming, exact cached star noise, video upload deduplication, source-frame seek quantization, and remount/rollback recovery fixes.
- Rebuilt Hero and Figure2 packed-alpha video from their original alpha sources. Preserved dimensions, frame counts, and transparency; keyframe intervals are now 4 and 6 frames. Combined files are 168,928 bytes smaller. Both reproducible rebuild scripts passed source/output validation.
- Full suite: 180 files / 1,413 tests passed. Subsequent focused runtime, presentation, shell, layer-store and star-field checks passed after their final changes. Lint, type checking, architecture/media validation, and production build passed without increasing budgets.
- Browser checks passed for phone Hero → Pattern → Star and reverse, desktop Hero ↔ Pattern, and phone native touch reading. Native reading was previously stuck at scrollY=0 because nested scroll containers blocked chaining; after the CSS fix, the same touch moved to scrollY=335.
- Production browser checks passed: native phone touch scrolled 285px, Method → Figure2 completed without transaction failures, returning to Method restored its 991px reading offset, and desktop Hero ↔ Pattern wheel transitions completed. Development HMR can retain an older runtime owner; final acceptance used a fresh production document.
- Physical WeChat and mobile Chrome device measurements are unavailable; local emulation is not a substitute for real-device acceptance. Nothing has been committed or pushed, and the production release has not been switched.
- The comprehensive follow-up now has opt-in public previews on the existing origin/CDN. Asset compression, optional loading policy, full-chapter checks and issues discovered on the public network are recorded in [the verification report](2026-09-30-public-performance-verification.md). Earlier counts above describe the first optimization stage; final follow-up results belong to that report.
- Full public desktop/Android-emulated forward and reverse runs passed all 16 chapters. Four viewport profiles, final Figure2 loading changes and independent WebKit visuals were verified. The final delivery remains preview 13; a preconnect-only experiment was reverted because alternating tests did not establish causation. Intermittent Chromium video-request timeouts remain explicitly documented, so overall real-device/network stability is not claimed as fully accepted.
