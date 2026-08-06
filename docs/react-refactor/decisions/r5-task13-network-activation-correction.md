# ADR: Task 13 network hints and same-stack activation correction

Status: accepted as the canonical Task 13 network/activation protocol;
supersedes the conflicting offline-admission and touchend-only activation
statements in `r5-task13-physical-choreography-correction.md` and the
corresponding Task 12 notes in the convergence plan.

## Context

The current physical candidate is NO-GO. On iOS Safari, `navigator.onLine` can
be `false` while a same-origin chunk is reachable and returns `200`. Waiting
for an `online` event before the first native import therefore turns a valid
entry into a permanent `moduleLoad` deadline. The same candidate also delays a
continuous-story media activation until `touchend`, after Safari's trusted
activation window has already been consumed by the first meaningful movement.

The existing reducer/runtime/projector remain the only authority. This ADR is a
protocol correction, not a scene-specific visual patch and not a second
coordinator.

## Decisions

1. `navigator.onLine` is a diagnostic hint only. An active transaction always
   starts its real same-origin dynamic import immediately. The native import is
   the authority; no probe request or alternate manifest is added.
2. A fulfilled dependency cache entry is written only after the native import
   succeeds. A native rejection reports through the existing chunk-recovery
   port, keeps the committed source/Loader visible, and is not retried in the
   same Document. A controlled reload remains the one existing recovery
   allowance.
3. Adjacent prewarm is optional. An offline hint may skip it, but it can never
   block a later active load. A real prewarm rejection is reported through the
   existing recovery port; aborting an obsolete prewarm is ignored.
4. A touch gesture establishes identity at `touchstart`. The first trusted
   `touchmove` above the threshold publishes the input, lets the reducer claim
   the physical epoch and start the transaction, and consumes the already
   mounted source activation synchronously in that same event stack. `touchend`
   only ends the claim. Direct-entry activation remains available for a real
   user gesture and is not changed into a continuous-story CTA.
5. Diagnostics expose the current network hint, last failure, blocking proof,
   activation surfaces, and missing proof without adding a production telemetry
   system. Deadline diagnostics distinguish module load, activation, media
   preparation/frame proof, and presentation proof.

## Scope and non-goals

This correction touches only the browser import/prewarm bridge, runtime touch
activation handoff, reducer-owned diagnostics, and their focused tests. It does
not change scene visual parameters, the Ink shader, media URLs, the manifest
model, or the single-authority architecture.

## Diagnostic checkpoint

The pre-correction Task 12 WIP is intentionally preserved as a NO-GO
diagnostic checkpoint rather than hidden in an untraceable commit:

- checkpoint HEAD: `34c306ed2c324256dcb81a9c5f47dd3a6b3b258d`
- worktree: 71 tracked/untracked changed paths at checkpoint capture
- candidate status: diagnostic only; no Task 13 release identity is frozen

The focused RED/green evidence for this ADR must be recorded against the
current worktree without running the full release suite. A clean candidate can
only be frozen after network/import and same-stack activation both pass.
