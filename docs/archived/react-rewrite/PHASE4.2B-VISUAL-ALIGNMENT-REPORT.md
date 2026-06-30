# Phase 4.2B Visual Alignment Pass

Date: 2026-06-30

## Scope

Phase 4.2B aligns the first frozen chain only:

```txt
hero -> pattern-bloom -> belief-star -> aod-animation -> method-top
```

No frozen scene id was added. No frozen segment graph was changed. No new `RuntimeEvent` was introduced. Runtime progress remains milestone-only; visual frames continue to move through local `visualProgressStore`.

## Source References

Compared against:
- `index.html`
- `js/effects/ink-scene-transition.js`
- `js/transitions/homepage/scene-timeline-manifest.js`
- `js/transitions/homepage/aod-homepage-adapter.js`
- `js/aod-scroll.js`
- `css/components/homepage-transitions.css`
- AOD and pattern-bloom related component CSS.

## Spike Implementation

SPIKE_REPO commits:
- `7151912 fix: align aod visual parity edges`
- `7941390 fix: align phase 4.2b visual ink chain`
- `ef1f47f fix: complete ink transition without webgl`

Key changes:
- `TransitionCompositeHost` no longer hardcodes only the first few segment ids for ink.
- `ink-transition` segments now choose the WebGL ink adapter from manifest `ink.kind`, `ink.direction`, and `ink.origin`.
- Later `ink-transition` segments no longer fall through to `null`.
- Compound sequences get a store-driven exit ink overlay, using the same segment visual progress without dispatching per frame.
- `RealInkCurtainAdapter` now supports driver-owned and store-driven modes, plus diagnostic data attributes for visual smoke validation.
- WebGL-unavailable and shader/program initialization failures use a progress-only fallback driver that still advances local visual progress and dispatches `SEGMENT_COMPLETE` once.
- AOD keeps the video/CSS/GSAP baseline and does not add an extra AOD ink canvas, because adding one dropped the existing AOD FPS probe below the 50 FPS gate. This preserves the Phase 4.2 mobile/performance contract.

## Ink Grammar Coverage

| Grammar | Status | Evidence |
| --- | --- | --- |
| center-out radial ink | Implemented | `hero-to-pattern-bloom`, `pattern-bloom-to-belief-star` exit overlay |
| bottom-up horizontal ink | Implemented | `belief-star-to-aod` and later horizontal ink segments |
| top-down horizontal ink | Implemented | compound exit overlay direction detection, covered by `ttg-compound-to-lab` test |
| compound sequence exit ink | Implemented | store-driven overlay starts at the exit step or final 38% fallback |
| ph-sun radial ink | Recorded/deferred | `lab-to-ph` will route through radial ink fallback; origin-specific art alignment remains for a later non-P0 pass |

## AOD Alignment

AOD remains aligned through:
- Source-parity `stableProgress()` and accelerated progress curve.
- Source-parity figure scale/y constants from `js/aod-scroll.js`.
- CSS variables for sun/cloud parallax, paper wash, bottom mist, paper solid, and video opacity.
- Lazy GSAP only on desktop-capable viewports.
- Mobile/coarse-pointer path stays on video/CSS baseline.
- Method copy reveal at 80% renders above the AOD visual layer (`copyZ=40`, `fromZ=10`), with no AOD ink canvas above it.

## Validation

Commands run in SPIKE_REPO:

```bash
SOURCE_REPO=/Users/aitoshuu/Documents/GitHub/TongyeGuanmi npm test -- --run
npm run build
SOURCE_REPO=/Users/aitoshuu/Documents/GitHub/TongyeGuanmi npm run validate:phase42-aod-fidelity
npm run validate:phase42-bundle
npm run validate:phase42-aod
npm run validate:phase42b-visual
npm run validate:phase42b-webgl-fallback
npm run lint
git diff --check
```

Results:
- `npm test -- --run`: 19 files / 102 tests passed.
- `npm run build`: passed.
- `validate:phase42-aod-fidelity`: 2 passed.
- `validate:phase42-bundle`: main gzip `78178`, GSAP gzip `27017`.
- `validate:phase42-aod`: desktop 61 FPS, mobile 61 FPS, reduced-motion passed.
- `validate:phase42b-visual`: passed.
- `validate:phase42b-webgl-fallback`: passed; forced WebGL `getContext()` to return `null`, observed fallback, committed `pattern-bloom`, and ended with unlocked runtime.
- `npm run lint`: exit 0, existing warnings only.
- `git diff --check`: passed.

Phase 4.2B visual smoke evidence:

```json
{
  "hero": {
    "clipPath": "circle(26.2677% at 50% 50%)",
    "inkDirection": "center-out"
  },
  "compound": {
    "toLayerOpacity": 0.573946,
    "inkDirection": "center-out",
    "progressMode": "store",
    "progressStart": "0.62"
  },
  "beliefToAod": {
    "clipPath": "polygon(0px 91.2014%, 100% 91.2014%, 100% 100%, 0px 100%)",
    "inkDirection": "bottom-up"
  },
  "aodReveal": {
    "fromZ": 10,
    "copyZ": 40,
    "ink": null
  }
}
```

## Gate Status

- Hero -> pattern-bloom ink is a WebGL ink curtain, not a placeholder.
- Pattern-bloom -> belief-star has a compound exit ink overlay driven by local visual progress.
- Belief-star -> AOD uses bottom-up horizontal WebGL ink and the to-layer mask advances.
- AOD -> method 80% reveal is not visually covered by AOD layers or ink.
- WebGL-disabled ink transitions complete through progress-only fallback and unlock the runtime.
- React progress remains milestone-only.
- Mobile path does not require GSAP and remains video baseline.
