# Phase 4.3 Visual UAT / Homepage Traversal Gate

Date: 2026-06-30

## Scope

Phase 4.3 closes the UAT issues that Phase 4.2B did not claim:

- `belief-star` settles to one active StarMap/copy after the pattern handoff.
- Upward scrolling can traverse back through the frozen scene graph.
- Later media segments no longer strand the runtime while full media assets remain pending.
- Full forward and reverse homepage traversal can be smoke-tested in Chromium.

This is still a React runtime parity gate, not a claim that every original Source animation asset has been migrated at final visual fidelity.

## Spike Commit

SPIKE_REPO commit:

- `6bee61f feat: add phase 4.3 visual uat traversal`
- `642491a fix: handle reverse intent at scroll boundary`

## Implementation Summary

- `SceneRuntimeProvider` now detects negative 10vh intent from `IDLE` through scroll, wheel, and touch deltas, so reverse traversal still fires when `scrollY` is already `0`.
- The reducer derives reverse direction from the same frozen segment graph, commits `segment.from` on reverse completion, and supports reverse `text-read` without introducing a new `RuntimeEvent`.
- `TransitionCompositeHost` renders reversed from/to layers, flips horizontal ink direction, and uses a timed visual-progress adapter for reverse media and non-AOD media placeholders.
- StarMap copy is suppressed in the transition `to` layer, so the `belief-star` copy appears once when the scene is active.
- The scroll runway was extended so large wheel deltas do not exhaust the page before the frozen graph is traversed.
- `scripts/phase43-visual-uat.mjs` validates full forward traversal to `contact`, forces the `pattern-bloom` reverse boundary to `scrollY=0`, and then validates reverse traversal back to `hero`.

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
npm run validate:phase43-uat
npm run lint
git diff --check
```

Results:

- `npm test -- --run`: 21 files / 109 tests passed.
- `npm run build`: passed.
- `validate:phase42-aod-fidelity`: 2 passed.
- `validate:phase42-bundle`: main gzip `78878`, GSAP gzip `27017`.
- `validate:phase42-aod`: desktop 61 FPS, mobile 61 FPS, reduced-motion passed.
- `validate:phase42b-visual`: passed.
- `validate:phase42b-webgl-fallback`: passed.
- `validate:phase43-uat`: passed.
- `npm run lint`: exit 0, existing warnings only.
- `git diff --check`: passed.

Phase 4.3 UAT evidence:

```json
{
  "beliefCommitted": {
    "phase": "IDLE",
    "activeScene": "belief-star",
    "activeSegment": null,
    "direction": "forward",
    "scrollLocked": false,
    "beliefLayers": [
      {
        "role": "active",
        "opacity": 1,
        "zIndex": 10,
        "copyCount": 1
      }
    ]
  },
  "contact": {
    "phase": "IDLE",
    "activeScene": "contact",
    "activeSegment": null,
    "direction": "forward",
    "scrollLocked": false
  },
  "topBoundaryBeforeHero": {
    "phase": "IDLE",
    "activeScene": "pattern-bloom",
    "activeSegment": null,
    "direction": "reverse",
    "scrollLocked": false,
    "scrollY": 0
  },
  "hero": {
    "phase": "IDLE",
    "activeScene": "hero",
    "activeSegment": null,
    "direction": "reverse",
    "scrollLocked": false
  },
  "failures": []
}
```

## Gate Status

- StarMap copy appears once after `belief-star` commit.
- Forward traversal reaches `contact`.
- Reverse traversal returns to `hero`.
- Reverse traversal from `pattern-bloom` to `hero` is validated with `scrollY=0`.
- Scroll lock is released at every sampled endpoint.
- AOD, WebGL fallback, and Phase 4.2B first-chain gates remain passing.
- No new `RuntimeEvent` was added.
