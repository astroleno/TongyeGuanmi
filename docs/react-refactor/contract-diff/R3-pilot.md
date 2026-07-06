# R3 Pilot Contract Diff

Status: pilot truth pass, waiting for HITL visual parity confirmation.

## Gap 1: mediaReady must honor direction contracts

- Classification: non-breaking R2 contract clarification.
- Exposed by: `aod-method-top` real media segment.
- R2 gap: R2 only proved a synthetic mediaReady gate. It did not explicitly freeze that `mediaPlayback.forward.required` and `mediaPlayback.reverse.required` must be evaluated by direction before waiting on mediaReady.
- R3 handling: `aod-method-top` declares `mediaPlayback.forward.mode: 'timeline'`; `shouldWaitForPilotMediaReady()` waits only for forward metadata/canplay readiness while the transition timeline scrubs video progress. Reverse uses the seeded `static-fallback` contract and does not block on video readiness.
- Backfilled tests:
  - `app/src/harness/r3/pilot-contract.test.ts` verifies forward waits, reverse skips, and non-media `star-map-aod` skips.
  - `app/src/transitions/aod-method-top/media.test.ts` covers metadata/canplay/ended stale and timeout behavior.
  - `app/e2e/r3-pilot.spec.ts` writes `artifacts/react-refactor/r3-pilot/pilot-devtools-trace.json` from the full `/harness/r3-pilot` success path; recovery and raw media probes are kept in separate trace files.
- Roll-forward: keep the direction-aware media gate in the shared ready-gate contract when R4 migrates the next media segment.
- Rollback: if HITL rejects this gate behavior, revert `shouldWaitForPilotMediaReady()` and reclassify reverse media readiness as required in `storyManifest.mediaPlayback.reverse`, then update the failing pilot tests.

## Non-gap implementation notes

- StrictMode effect replay surfaced a harness-local issue: stopping the actor in React effect cleanup left the replayed harness with a stopped runtime. R3 now matches the R2 harness pattern and only unsubscribes during cleanup.
- Old homepage AOD evidence is pure scrub (`seekVideoToProgress` in `js/components/aod-transition.js`); R3 keeps `aod-method-top` scrub-only, keeps the ink canvas transparent unless WebGL renders into it, and records raw `ended` truth through the isolated `r3-probe:*` harness path, not the visual transition timeline.
- HITL visual parity pass corrected `star-map-aod` to use the shader boundary itself rather than a CSS polygon approximation. The AOD target frame is rendered into a WebGL texture and revealed inside the old `createInkCurtainTransition` fragment shader from `js/effects/ink-scene-transition.js`, so the `edge`, `body`, `feather`, `openingSpatter`, `particles`, and `particleCore` fields drive both the visible ink and the from/to reveal boundary. The visible ink constants now use the old main hero exit values from `js/sections/hero.js` (`colorLift: 0.56`, `coverAlpha: 0.82`, `fadeOutStart: 0.74`, `fadeOutEnd: 0.98`). AOD figure video now uses the native alpha in `assets/aod_figure-alpha-front-scrub.webm` as an occluding front layer, with no whole-video opacity fade or blend-mode compositing.
- No `transitions/shared/` fork was created.

## Trace Sample

- `artifacts/react-refactor/r3-pilot/pilot-devtools-trace.json`
- Contains explicit `actorEpoch`, `activeRunId`, `prepareToken`, `queuedIntent`, `pausePoint`, `cursor`, `layerWindow`, event payloads, and full-pilot media readiness milestones.
