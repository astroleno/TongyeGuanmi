# R5 Phone Clean Runtime Task 7 Visual Disposition

Frozen visual donor: `9652fbe`. This ledger assigns every Front visual source
before migration. It authorizes visual/pure-rendering transfer only; legacy
runtime types, input/lifecycle ownership, stable state, Loader authority,
transaction clocks, and checkpoint writes are explicitly excluded.

| Slice | Donor source at `9652fbe` | Canonical destination / disposition |
| --- | --- | --- |
| 7B Hero | `production/phone/scenes/PhoneHero.tsx` (`00f940e`), `PhoneHero.css` (`2252c95`), `PhoneHero.motion.ts` (`e6aff7d`), `PhoneHero.test.tsx` (`b667b51`) | Move the genuine composition, copy, image/packed-alpha surfaces, radial intro sampling, and zero-progress motion to `scenes/hero/phone/`. Replace adapter props/handles with the closed leaf report/command boundary. Add only the reviewed Hero font declaration from `82a4e68`; do not donate its parent lifecycle. |
| 7B Loader | Current shared `production/StoryLoader.tsx` plus Task 5 projector proof | Keep one shared Loader. Preserve opaque black handoff and ink sequence; no scene-owned release, safety exit, or topology change. |
| 7C Pattern | `production/phone/scenes/PhonePattern.tsx` (`111be47`), `PhonePattern.css` (`30743af`), `PhonePattern.test.tsx` (`fb1c15f`) | Move the genuine image, accepted geometry, and `PatternBloomRenderer` sampling to `scenes/pattern/phone/`. Coverage remains exclusively projector-owned; no strip/gradient/overscan concealment. |
| 7D AOD | `production/phone/scenes/PhoneAod.tsx` (`77e0363`), `PhoneAod.css` (`b6116c6`) | Move authored AOD progress, packed media topology, and visual assets to `scenes/aod-animation/phone/`. Remove `aod-autoplay` lifecycle ownership; runtime commands activation/playback and accepts only causal compositor-frame proof. |
| 7D media | `production/phone/phone-media.ts` (`578e14f`), `production/phone/scenes/phone-packed-alpha-surface.ts` (`356f3de`) and test (`ff96453`) | Move URL ownership resolver to `media/phone-media.ts` and the reusable surface to `media/phone-packed-alpha-surface.ts`. `story/media.ts` remains the immutable identity source. Retry renews Canvas/context and generation; retired tokens cannot report. |
| 7E Star Map | `production/phone/scenes/PhoneStarMap.tsx` (`9cff9a3`), `PhoneStarMap.css` (`bb3b8ed`) | Move the genuine camera/mask, source image, Canvas draw, and copy to `scenes/star-map/phone/`; replace adapter/current-progress authority with the closed command/report port. |
| 7E Hero → Pattern | `production/phone/transitions/hero-pattern.tsx` (`6132262`) and test (`12db52b`) | Move direction, seed, and above-both Ink presentation to `transitions/hero-pattern/phone.tsx`; runtime owns progress/time. |
| 7E Pattern → Star | `production/phone/transitions/pattern-star-map.tsx` (`f44ad04`) | Move direction, seed, and above-both Ink presentation to `transitions/pattern-star-map/phone.tsx`; runtime owns progress/time. |
| 7E Star → AOD | `production/phone/transitions/star-map-aod.tsx` (`c09deca`) | Move direction, seed, and above-both Ink presentation to `transitions/star-map-aod/phone.tsx`; runtime owns progress/time. |
| 7E AOD → Method | `production/phone/transitions/aod-method-top.ts` (`180742a`) | Move the prepared between-plane renderer to `transitions/aod-method-top/phone.ts`. It may prepare in Task 7 but cannot prove the Method receiver before Task 8. |

Shared pure dependencies such as `scenes/pattern/patternBloomRenderer.ts`,
`scenes/star-map/starFieldReveal.ts`, `story/copy.ts`, `story/media.ts`, and
`media/packed-alpha-video.ts` remain canonical dependencies; they are not
duplicated. Temporary old-formal translation stays stateless in the existing
Front adapter/module-loader files and is recorded for Task 11 deletion.
