# Scene Naming Decisions

Date: 2026-06-30
Phase: 4.0A Manifest Freeze

This document records the canonical scene naming decisions for the React migration. After this freeze, `react-runtime-spike/src/manifest/realManifest.ts` is the source of truth for scene ids and segment edges.

## Conflict Resolution Summary

Unresolved canonical scene id conflicts: none.

The source-only ids found in `scene-id-extraction.txt` are resolved as method-local anchors or Figure2 compound sub-states. The spike-only ids are canonical runtime scenes introduced by the frozen React graph and are now represented in `realManifest.ts`.

## Decision 1: `belief-star` vs `star-map`

Decision: keep `belief-star`; retire `star-map` as a canonical scene id.

Rationale:

- `belief-star` is the original HTML `data-scene-id` for the belief section and carries the narrative meaning of the scene.
- `star-map` describes one visual treatment, not the committed scene identity.
- Freezing the semantic source id reduces future migration churn when the original section is ported into React.

Implementation impact:

- `realManifest.ts` uses `belief-star` in `scenes[]`.
- The old spike-only `star-map` id is treated as an implementation/component name to migrate later, not a runtime scene id.
- Existing source extraction will still show `pattern-bloom` followed by `belief-star`; that is the canonical Phase 4.0A chain.

Sign-off placeholder:

- Tech Lead: [ ]
- Product: [ ]
- Design: [ ]

## Decision 2: `method-*` granularity

Decision: flatten method into two canonical scenes: `method-top` and `method-bottom`.

Rationale:

- The original five method markers are local anchors or sub-states inside one reading section, not separate runtime commits.
- The spike and contract already model method reading as one `text-read` edge from `method-top` to `method-bottom`.
- Two committed scenes keep the global scene graph smaller while still preserving the read boundary needed for the Figure2 handoff.

Implementation impact:

- `method-upper`, `method-lower`, `method-cocreation`, `method-tooling`, `method-proof`, and `method-field-law` are not canonical scene ids.
- The method section may keep internal anchors/components, but they must not dispatch global runtime scene changes.
- The canonical segment remains a `text-read` edge from `method-top` to `method-bottom`.

Sign-off placeholder:

- Tech Lead: [ ]
- Product: [ ]
- Design: [ ]

## Decision 3: `figure2-proof-cards` / `figure2-proof-closing`

Decision: model `figure2-proof-cards` and `figure2-proof-closing` as sub-states of `figure2-animation`, not first-class scenes.

Rationale:

- The proof cards and closing copy are part of the Figure2 transition narrative; they do not need independent committed scene ownership.
- Keeping them inside a compound sequence avoids adding global scene ids for transient hold states.
- Debugging remains explicit through compound step ids without expanding the scene graph.

Implementation impact:

- `realManifest.ts` contains one canonical `figure2-animation` scene.
- `figure2-proof-cards` and `figure2-proof-closing` may appear only as compound step ids or local component state.
- Validation treats these ids as internal Figure2 states, not `scenes[]` members.

Sign-off placeholder:

- Tech Lead: [ ]
- Product: [ ]
- Design: [ ]
