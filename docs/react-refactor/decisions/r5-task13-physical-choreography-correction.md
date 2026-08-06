# ADR: Task 13 physical choreography correction

- Date: 2026-08-03
- Status: accepted; **Task 12 reopened / NO-GO**; corrective implementation is
  under focused verification and Task 13 is paused
- Scope: phone clean runtime, presentation projector, input host adapter, Loader handoff

## Context

The frozen `8f39139` candidate passed the Task 12 automated closure, including
the 227-case release suite, but native iOS Simulator gestures contradicted that
result:

- Hero → Pattern kept the receiver hidden until the final commit instead of
  revealing it through the Ink boundary;
- Pattern, Star Map, AOD, and later cinematic chapters were all driven by one
  undifferentiated progress value, losing their authored endpoint holds and
  media-clock ownership;
- a warm Star → AOD gesture could reach the normal activation CTA path;
- Method Reading could not consume native document pixels before the next
  cinematic intent;
- Hero completed behind the Loader, while the static and React loaders both
  authored visible text.

This triggers Appendix C twice: physical-device evidence contradicts the
automated gates, and an honest correction exceeds the original core LOC
allocation. The user accepted the supplied findings and implementation plan
and explicitly authorized execution.

## Decision

Keep one clean runtime, one reducer, one projector, and the existing ten-file
core. Correct the contracts in place:

1. `manifest.ts` owns one exhaustive 15-segment choreography ledger. Each row
   independently maps reducer progress to source, target, effect, endpoint
   opacity, stable hold, media-clock owner, and canonical foreground owner.
2. `runtime.ts` remains the only clock and command interpreter. It projects
   each leg through that ledger, settles each scene at its declared hold, and
   grants playback only to the declared media-clock owner.
3. `presentation.ts` applies the same Ink-field ownership to both planes,
   including complementary WebKit masks for radial Ink, and owns semantic
   source/receiver stacking.
4. The host adapter begins a story transaction on the first directional
   `touchmove`, keeps that gesture claimed, and consumes activation on that
   same trusted `touchmove` stack. `touchend` only closes the claim. Stable
   commits prewarm only adjacent modules and immutable metadata; prewarm never
   mounts, plays, or activates. The superseding network/activation ADR records
   the non-blocking `navigator.onLine` hint and same-stack activation contract.
   Continuous segment activation never renders a CTA: a rejected or late
   activation keeps or restores the proved source and a later normal gesture
   retries through a fresh transaction. The CTA remains limited to a true
   cold/direct-entry permission fallback with no committed source.
5. Reading roots use `data-phone-input-owner="native-document"`. Native pixels
   are not prevented; reaching an edge arms the handoff, and only a new outward
   gesture starts the next segment.
6. The pre-hydration Loader is a textless safety cover. The React Loader is the
   sole text/Ink author. Cold Hero remains at progress zero until Loader exit
   begins, and story input remains disabled until Loader hidden.

The frozen shared story manifest, canonical spine, timings, and camera
composition remain unchanged; the narrowly scoped media amendment below is the
only exception. No legacy runtime, global media-unlock sweep,
second state machine, scene-specific coordinator, or eleventh core file is
introduced.

### Frozen AOD static-entry poster amendment

The iOS Safari correction additionally permits one new immutable, portrait-only
AOD first-frame asset: `assets/aod-figure-opening.webp`. It is decoded as the
static direct-entry proof; packed video remains inactive until the outgoing
trusted gesture owns playback. Its exact source identity is recorded in
`app/scripts/homepage-media-contract.mjs` (333,488 bytes,
`d50dbe4cbc417dfa4eba4616d66dd145616000c4cb2724bb391a51d97c4a70c2`).

The all-WebP inventory ceiling is correspondingly re-frozen at the exact new
inventory total of 11,866,072 bytes. This is not a reusable media-growth
allowance: any later byte increase remains a verifier failure and needs a new
review.

## Bounded core budget amendment

The original limits encouraged code compression after the core had already
reached its frozen boundary. They are replaced by these fail-closed maxima:

| File | Maximum non-blank lines |
| --- | ---: |
| `protocol.ts` | 475 |
| `presentation.ts` | 975 |
| `manifest.ts` | 750 |
| `machine.ts` | 1,160 |
| `runtime.ts` | 1,250 |
| `PhoneStoryShell.tsx` | 690 |
| `scenes.tsx` | 700 |
| `transitions.tsx` | 700 |
| `PhoneBrandLabStory.tsx` | 120 |
| Total TypeScript/TSX in the ten-file core | 5,700 |

The post-implementation allocation review raises only the reducer, host-adapter,
and aggregate ceilings. The additional lines are the reducer-owned
`mediaClockOwner` activation policy and the same-epoch native-reading touch
arbiter required by this ADR; they do not introduce a new runtime, coordinator,
or core file. The 663,552-byte phone JavaScript hard cap, module provenance
rules, frozen input checks, and ten-file allowlist are unchanged. Exceeding
these amended limits triggers a new review; it does not authorize code golf or
another file.

## Alternatives rejected

- Per-scene CSS patches would preserve the broken common progress/ownership
  model and multiply symptoms.
- Restoring the legacy input controller or lifecycle runtime would create a
  second authority and undo the clean cutover.
- Keeping a continuous-story activation CTA, relaxing timing, or relaxing
  bundle gates would hide the physical failure rather than restore the
  accepted choreography.
- Fitting the correction into 5,000 lines by terse tuples, removed diagnostics,
  or moving policy into frozen shared files would make the architecture less
  auditable.

## Verification and release consequence

`8f39139` remains preserved only as historical diagnostic evidence. Task 12 is
reopened and Task 13 is paused. Development uses deterministic choreography,
projector, touch/activation, reading-edge, Loader, and affected media tests.
After one native Simulator forward/reverse journey is stable for the required
focused repeat, run the static gates, full Vitest, and exactly one complete
release suite. Freeze one replacement candidate and restart Task 13 from cold
`/`; no production WIP may be labeled `Chunk-contract-complete` or
`Release-complete` before that closure.
