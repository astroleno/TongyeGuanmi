# Mount Self-Fade R0 Checklist

R0 status: fixture and review checklist only. This is intentionally not an ESLint error until the R2 Stage visibility contract is stable.

## Fixture

- Fixture path: `app/src/stage/__fixtures__/mount-self-fade.fixture.ts`
- The fixture records the rejected pattern: a scene mutating its own visibility on mount.
- It also records the accepted pattern: mounted layers remain hidden until the transition timeline changes visibility.

## Review Checklist

- Scene components must not call GSAP or CSS animation APIs from mount effects to make their root layer visible.
- Scene `preload()` and `mount(hidden)` may prepare handles, but must not change `opacity`, `visibility`, `transform`, or pointer interactivity.
- Transition modules own visibility changes between `from` and `to` layers.
- R2 must promote this into automated Stage visibility tests before the rule can become blocking.
