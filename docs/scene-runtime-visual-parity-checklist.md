# SceneRuntime MVP Visual Parity Checklist

Use this checklist on `index-scene-runtime.html?sceneRuntime=1`. Capture desktop, mobile portrait fallback, and mobile landscape widths.

## Required Captures

- initial hero
- after hero-to-pattern
- pattern steady
- after pattern-to-star-map
- star-map steady
- aod poster
- AOD 80% early-copy
- method-top landed
- method-bottom landed

## Pass Criteria

- `hero-to-pattern` uses the real pattern bloom and ink reveal, with no CSS-only placeholder rings.
- `pattern steady` shows the real layered pattern mirror canvas.
- `pattern-to-star-map` uses the rotating-left/exit bloom behavior and lands on the star-map copy without reveal conflicts.
- `star-map-to-aod` uses the horizontal irregular WebGL ink curtain, not a flat gradient.
- `aod poster` shows paper/cloud/sun/video first-frame readiness before the second intent.
- `AOD 80% early-copy` shows the method handoff overlay and early copy without stale hidden reveal state.
- `method-top landed` and `method-bottom landed` preserve the PR4 read-complete semantics.
- Mobile portrait shows the rotate prompt instead of a broken squeezed visual stage.
- Mobile landscape uses the cinematic horizontal stage for the MVP route.
- Mobile landscape method views keep the lead copy in the left column, the process flow in the right column, and still advance through read-complete.
- Browser console is clear of page errors and unexpected warnings.

## Reference Viewports

- Desktop: `1440x950`
- Mobile portrait fallback: `390x844`
- Mobile landscape: `844x390`
