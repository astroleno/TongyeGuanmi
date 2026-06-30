# Phase 4.2 Tech Validation Report: AOD + GSAP + Video

Date: 2026-06-30

## Scope

Phase 4.2 validates one complex scene only: `aod-animation -> method-top`.

Scene graph status:
- No canonical scene id added.
- No frozen segment graph expansion.
- No new `RuntimeEvent` introduced.
- No per-frame React dispatch reintroduced.

## Implementation Summary

SPIKE_REPO changes:
- `AODMediaAnimationAdapter` now uses media playback as the primary progress source through `createMediaBasedVisualProgressDriver`.
- AOD visual progress remains imperative through `visualProgressStore`, not React state.
- `AODScene` registers its video element for the adapter and no longer owns playback.
- AOD visual math was aligned with the original `aod-scroll.js` constants:
  - `FIGURE_START_SCALE = 0.62`
  - `FIGURE_START_Y_VH = 7.5`
  - accelerated progress `0.78 * t + 0.22 * t * t`
  - backdrop and fullscreen ranges from the original transition timing.
- Desktop-only GSAP enhancement is lazy-loaded and limited to AOD-owned layer refs.
- Mobile/coarse-pointer/reduced-motion paths stay on the native CSS/video baseline.

## Adapter Contract Evidence

Automated tests prove:
- AOD playback does not dispatch per frame.
- `MEDIA_PROGRESS` at 80% reveal is emitted once.
- `SEGMENT_COMPLETE` is emitted only at completion.
- `MEDIA_REJECTED`, `MEDIA_MISSING`, `MEDIA_METADATA_TIMEOUT`, `MEDIA_ENDED_TIMEOUT`, and `REDUCED_MOTION_SKIP` are covered.
- AOD render count stays below 10 while 30 imperative visual progress updates run.
- AOD source visual parity is checked against `js/aod-scroll.js` constants and layer transform math.

Command:
```bash
npm test -- --run
```

Result:
```txt
Test Files  18 passed (18)
Tests       96 passed (96)
```

## Visual Fidelity Evidence

Command:
```bash
SOURCE_REPO=/Users/aitoshuu/Documents/GitHub/TongyeGuanmi npm run validate:phase42-aod-fidelity
```

Result:
```txt
Test Files  1 passed (1)
Tests       2 passed (2)
```

Interpretation:
- The spike reads Source `js/aod-scroll.js` during the gate.
- The gate verifies the frozen AOD constants used by the original page:
  - transition duration, fullscreen range, backdrop exit range
  - figure start scale and Y offset
- The gate compares progress curve and owned layer transforms across multiple progress, parallax, and viewport samples.
- This proves the AOD visual model is source-parity for the desktop/mobile baseline math before GSAP enhancement is applied.

## Bundle / GSAP Evidence

Command:
```bash
npm run build
npm run validate:phase42-bundle
```

Result:
```json
{
  "main": {
    "file": "index-IfoIMEXq.js",
    "bytes": 258223,
    "gzipBytes": 77895
  },
  "gsap": [
    {
      "file": "aod-gsap-CxagL6bE.js",
      "bytes": 69654,
      "gzipBytes": 27017
    }
  ]
}
```

Interpretation:
- GSAP is emitted as a separate lazy chunk: `aod-gsap-*`.
- `index.html` does not eagerly reference the GSAP chunk.
- Main gzip remains under the Phase 4.2 check threshold of 85 KB.

## Browser Probe Evidence

Playwright Chromium probes were codified in SPIKE_REPO:

```bash
npm run validate:phase42-aod
```

Desktop:
```json
{
  "progress": [0.0391, 0.7706],
  "fps": 60,
  "enhancement": "ready",
  "revealReached": true
}
```

iPhone SE viewport proxy:
```json
{
  "progress": [0.0357, 0.7761],
  "fps": 61,
  "enhancement": null,
  "revealReached": true
}
```

Reduced motion:
```json
{
  "reducedMotionEvent": true,
  "methodCommitted": true
}
```

80% reveal probe:
```json
{
  "cssProgress": "0.8821",
  "currentTime": 4.550246,
  "duration": 5.033,
  "copyCount": 1,
  "runtimeSegmentProgress": 0.8,
  "copyOwner": "method-top"
}
```

Interpretation:
- AOD visual progress advances continuously from actual video playback.
- The runtime reveal occurs once at the 80% milestone.
- Method copy appears through runtime layer ownership, not GSAP DOM ownership.
- Desktop loads GSAP enhancement; mobile proxy does not.
- Reduced motion uses the poster-and-skip path and commits the method target.

## Video Fallback Matrix

| Path | Runtime event | Policy | Result |
| --- | --- | --- | --- |
| autoplay rejected | `MEDIA_REJECTED` | `show-poster-and-complete` | poster fallback, commit target |
| missing AOD media | `MEDIA_MISSING` | `show-poster-and-complete` | poster fallback, commit target |
| metadata timeout | `MEDIA_METADATA_TIMEOUT` | `show-poster-and-complete` | poster fallback, commit target |
| ended timeout | `MEDIA_ENDED_TIMEOUT` | `force-complete-and-commit` | force complete, commit target |
| reduced motion | `REDUCED_MOTION_SKIP` | `poster-and-skip` | poster, skip playback, commit target |

## Mobile Strategy

Low-end mobile policy:
- Prefer video baseline and CSS variables.
- Do not require GSAP on coarse-pointer/mobile viewports.
- Keep AOD media muted, inline, non-looping, and adapter-owned.
- If decode or autoplay fails, use poster fallback instead of holding scroll lock.

Recommended encoding baseline before Phase 4.3:
- Keep the selected AOD alpha asset near the current 5.03s runtime.
- Maintain a 720p mobile encode candidate if iPhone SE hardware validation drops below 50 FPS.
- Keep poster fallback visually acceptable because it is the reduced-motion and recovery surface.

## Remaining Manual Check

`xcrun simctl` is not available in this environment, so a real iPhone SE Simulator run was not executed here. The automated mobile viewport proxy hit 61 FPS and confirmed GSAP is skipped on mobile, but hardware/simulator validation should still be repeated before Phase 4.3 if available.

## Gate Status

- AOD visual fidelity: implemented from original constants and validated by browser progress probes.
- Source visual parity gate: passed.
- GSAP lazy-load: passed.
- Adapter milestone-only contract: passed.
- Video fallback paths: passed.
- React render count: passed.
- Mobile baseline strategy: passed by automated proxy; real iPhone SE Simulator unavailable in this environment.
