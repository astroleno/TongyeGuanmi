# Figure2 Modeling Decision

Date: 2026-06-30
Phase: 4.0A Manifest Freeze

## Decision

Chosen: Option A, a single `compound-sequence` segment from `figure2-animation` to `brand`.

## Original Behavior

The original Figure2 transition plays a staged questioning sequence, holds proof-card and closing-copy moments, then hands off into the brand scene.

## Options Considered

### Option A: Single `compound-sequence`

The top-level scene graph contains one segment:

```txt
figure2-animation -> brand
```

The intermediate proof cards, closing copy, and exit transition are modeled as compound steps.

### Option B: Two segments plus intermediate scene

The top-level scene graph would add an intermediate committed scene between `figure2-animation` and `brand`, then connect it with two top-level segments.

## Rationale

Option A is selected because the Figure2 proof moments are transition states, not independent navigation or committed document scenes. They need explicit debug visibility, but they do not need global scene ownership. A single compound sequence keeps the runtime scene graph stable while allowing the Figure2 adapter to expose named steps.

## Implementation Impact

- `realManifest.ts` contains `figure2-compound-to-brand` as one top-level segment.
- `figure2-proof-cards` and `figure2-proof-closing` stay inside the compound sequence.
- No new `RuntimeEvent` is required.
- No visual migration or Figure2 adapter implementation is part of Phase 4.0A.

## Sign-off Placeholder

- Tech Lead: [ ]
- Product: [ ]
- Design: [ ]
