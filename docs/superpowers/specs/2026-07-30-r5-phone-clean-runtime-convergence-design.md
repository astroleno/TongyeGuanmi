# R5 Phone Clean Runtime Convergence Design

**Status:** Accepted. The user explicitly selected a clean convergence from the
confirmed Unit 4–7A scene baseline instead of continuing to repair the current
Unit 7B/recovery runtime.

**Decision date:** 2026-07-30

**Implementation branch:** `codex/r5-phone-clean-runtime-convergence`

**Exact base:** `9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f`
(`merge(r5): integrate Unit 6 phone donor`)

## 1. Problem statement

The phone route has repeatedly passed reducer, source-contract, Chromium, and
Playwright WebKit gates while still exhibiting physical presentation failures:

- AOD can remain locked without a compositor frame.
- Pattern and Figure2 can expose a bottom/right strip.
- Hero can expose a completed frame, reset, or change stage topology after the
  Loader disappears.
- A stable cursor can be published while edge color, layer ownership, target
  content, or pixels still belong to the previous scene.
- Formal `/` and QA composition have carried separate lifecycle behavior.
- Lazy slice boundaries and later property-name mangling introduced a second
  class of execution-contract failures.
- The attempted repair grew the reachable production phone directory from 76
  non-test files at `9652fbe` to 122 at `be9db27`, without achieving physical
  iPhone release acceptance.

The underlying problem is not a missing AOD condition or CSS patch. It is that
story authority, presentation proof, input ownership, media proof, and route
composition were allowed to commit independently.

## 2. Evidence-backed baseline

The accepted donor commits are:

| Unit | Commit | Frozen value |
| --- | --- | --- |
| Unit 4 | `3deb717` | Front/Grade A scene geometry, Figure2 media and authored handoffs |
| Unit 5 | `35b0aee` | Brand–Lab scenes and persistent Figure3/Services reverse compositor |
| Unit 6 | `ab7353e` | PH–Contact scenes, packed-alpha media, and reverse compositor contracts |
| Unit 7A | `eca6bc2` | Safari endpoint presentation and accepted Figure3 paper endpoints |

`9652fbe` is the only integration point that contains all four donors and whose
next commit is the Unit 7B integration (`c808e06`). The clean branch therefore
starts at `9652fbe`; it does not start at `d4d29bc`, `be9db27`, or the
presentation-recovery branch.

The clean baseline is executable:

- `pnpm -C app test`: 170 files, 950 tests passed.
- `pnpm -C app typecheck`: passed.
- `pnpm -C app build`: passed.
- Phone JavaScript: 628,044 bytes against the immutable 663,552-byte cap.
- Phone headroom: 35,508 bytes.

The following inputs are immutable unless the user approves a separate visual
change:

- `assets/`
- `app/scripts/homepage-media-contract.mjs`
- `app/src/story/timings.ts`
- `app/src/story/copy.ts`
- `app/src/story/canonical-spine.ts`
- `app/src/story/manifest.ts`
- scene order, copy order, authored durations, camera composition, ink
  direction, media bytes, and persistent compositor semantics

## 3. Alternatives considered

### A. Continue the presentation-recovery branch

Rejected. It inherits both generations of phone orchestration, still has a
split presentation commit, and contains non-publishable WIP. Its real-browser
findings are valuable test donors, but its runtime is not a source donor.

### B. Shrink `be9db27` in place

Rejected. This requires proving which of 190 changed files are authoritative
while deleting compatibility paths around a state machine that already failed
physical presentation. Reversal cost and regression ambiguity are too high.

### C. Build one clean phone runtime from `9652fbe`, validate it in a
development-only harness, then perform one production cutover

Accepted. This preserves the last integrated Unit 4–7A scene/media baseline,
keeps the formal route on one runtime at all times, and lets the new authority
be proven before old orchestration is deleted in the cutover commit.

## 4. Architecture decisions

### ADR-1: One route-local authority, not one cross-route singleton

- Formal `/` may create exactly one authority, and only
  `PhoneStoryShell` may create it.
- `/brand-lab` is a QA-only route. `PhoneBrandLabStory` creates its own
  route-local authority by calling the same `createPhoneStoryRuntime()` factory
  with `scope: 'brand-lab'`.
- Route changes dispose the previous object. The two routes do not share an
  in-memory store.
- The QA shell may choose an initial scene, mount a reduced subtree, and expose
  diagnostics. It may not define a reducer, projector, input policy, timing,
  media policy, or lifecycle callback.
- The formal module graph must not import `PhoneBrandLabStory`.

### ADR-2: One durable snapshot and one reducer

The phone runtime owns one discriminated snapshot:

```ts
type PhoneStorySnapshot =
  | Readonly<{
      status: 'booting';
      authorityId: string;
      revision: number;
      entry: PhoneEntryRequest;
      committed: null;
    }>
  | Readonly<{
      status: 'stable';
      authorityId: string;
      revision: number;
      committed: PhoneCommittedPresentation;
      transaction: null;
      scroll: PhoneScrollSample;
    }>
  | Readonly<{
      status: 'transaction';
      authorityId: string;
      revision: number;
      committed: PhoneCommittedPresentation;
      transaction: PhoneTransaction;
      scroll: PhoneScrollSample;
    }>;
```

There is no separately writable cursor, checkpoint, current scene, stage scene,
edge scene, navigation scene, AOD phase, cinematic phase, lock, anchor, or
direct-entry state. Those values are either fields in the active transaction
or selectors over the snapshot.

`runtime.ts` is the only module that:

- reduces events;
- mints authority/transaction/generation identity;
- owns timers, RAFs, listeners, gesture epochs, and AbortControllers;
- executes prepare/play/render/measure/scroll/release effects;
- handles initial/hash/menu/history entry;
- publishes snapshots.

### ADR-3: Stable is a presentation transaction, not a cursor value

A target may become stable only after all applicable evidence belongs to the
same authority, transaction, generation, leg, direction, and candidate
revision:

1. target module mounted;
2. target root connected;
3. target content predicate true;
4. required image/video/canvas frame proven;
5. source/receiver/effect roles applied;
6. the live visual viewport covered on all four edges;
7. target landing measured and scroll alignment confirmed;
8. edge/theme/checkpoint/navigation values derived from the same manifest
   entry;
9. the final presentation plane applied and acknowledged.

The prior committed plane stays visible until the target plane is proven.
Failure rolls back to that committed plane and releases input. A candidate
scene is never published as a stable scene.

### ADR-4: One presentation implementation

`presentation.ts` owns:

- explicit surface/effect registration;
- the single persistent stage and coverage plane;
- live visual-viewport measurement;
- semantic layer-plan calculation;
- DOM application of one complete presentation revision;
- target-content and first-frame validation;
- post-paint acknowledgement.

It does not own story progression. It reports facts to `runtime.ts`.

The CSS topology is fixed before Loader release. No later
`absolute → fixed` stage switch is allowed. The coverage plane and scene plane
must share one documented stacking context; a sibling opaque pseudo-element
may not sit above the stage.

### ADR-5: Presentation gates are global

The following are required for every applicable hold and segment, not only for
Hero, AOD, Pattern, or direct-entry fixtures:

- effect layer placement;
- dynamic visual-viewport coverage;
- media/compositor first frame;
- direct target content visibility;
- source/receiver endpoint continuity;
- forward and reverse terminal frame;
- reduced-motion static frame;
- rollback frame.

Datasets and CSS strings are diagnostics, not proof. Real browser geometry,
computed stacking contexts, frame callbacks, and pixel samples are the
acceptance evidence.

### ADR-6: Lazy chunks contain leaves, never authority

- `PhoneStoryShell`, `manifest.ts`, `runtime.ts`, and `presentation.ts` load as
  one phone execution core.
- Only genuine scene and transition leaves are lazy.
- Lazy leaves may receive a narrow render/report port. They may not import the
  runtime, dispatch reducer events directly, retain the snapshot, or own input.
- Vite property-name mangling is forbidden. The clean implementation must not
  create a reserved-property registry or a generated cross-chunk policy file.
- Existing ESM module exports and ordinary Terser compression remain the
  chunk contract.
- If the bundle approaches the cap, duplicate orchestration is deleted; API
  property names are not mangled.

### ADR-7: Complexity is budgeted by authority, not by legitimate visuals

Distinct authored scenes and transitions may remain separate files. The file
problem is the number of lifecycle, compatibility, and cross-cutting owners.

At final cutover, `app/src/production/phone-story/` contains exactly these
eight production files:

```text
phone-story/
  PhoneStoryShell.tsx
  PhoneBrandLabStory.tsx
  manifest.ts
  runtime.ts
  presentation.ts
  styles.css
  scenes.tsx
  transitions.tsx
```

Tests live beside these files or under `__tests__/` and do not count toward the
production budget. Genuine leaf components remain under canonical
`app/src/scenes/<scene>/phone*` and
`app/src/transitions/<segment>/phone*` paths.

Final structural limits:

- one runtime factory;
- one reducer;
- one stable-commit path;
- one input/listener owner;
- one viewport sampler;
- one presentation registry;
- zero compatibility wrappers;
- zero slice-level runtimes;
- zero production query aliases that replace the formal route;
- no `runtime/`, `contracts/`, `registries/`, or `projectors/` subtrees under
  `phone-story/` without a new user-approved ADR.

### ADR-8: Desktop stability is matched through invariants, not object sharing

The phone route keeps native document scrolling and its phone presentation
geometry. It does not share a live Director object with desktop and does not
modify the stable desktop runtime during this project.

It must match the desktop route's important invariants:

- one active run;
- one input owner;
- one time owner;
- stale event rejection;
- target readiness before playback;
- atomic terminal settle;
- rollback to a visible committed endpoint;
- deterministic disposal;
- no route-local duplicate lifecycle.

Shared canonical story types, scene order, timings, and media remain common.

## 5. Event and transaction model

The reducer accepts five event families:

| Family | Examples | Rule |
| --- | --- | --- |
| entry | `ENTRY_REQUESTED`, `HISTORY_REQUESTED` | Initial/hash/menu/history use one path |
| input | `GESTURE_STARTED`, `INTENT_CLAIMED`, `SCROLL_SAMPLED` | Only runtime attaches physical listeners |
| preparation | `TARGET_MOUNTED`, `MEDIA_PREPARED`, `PREPARE_FAILED` | Readiness never commits presentation |
| playback | `FIRST_FRAME`, `PROGRESS`, `PLAYBACK_COMPLETE`, `PLAYBACK_FAILED` | Every report carries current identity |
| presentation | `PLANE_APPLIED`, `TARGET_PROVEN`, `SCROLL_CONFIRMED` | Stable commit requires the complete set |

An animated transaction follows:

```text
stable(source)
→ preparing
→ presenting-source
→ playing
→ presenting-target
→ aligning
→ verifying
→ stable(target)
```

Failure follows:

```text
any transaction phase
→ rolling-back
→ source plane proven
→ source scroll confirmed
→ stable(source), input free
```

Reduced motion uses the same transaction and skips only animated progress:

```text
stable(source)
→ preparing
→ presenting-target
→ target static frame proven
→ aligning
→ verifying
→ stable(target)
```

Scene-internal native reading/scrub progress is a scroll sample on the stable
snapshot, not another lifecycle. It may render progress, but it cannot change
the committed scene, layer plan, checkpoint, or input lock.

## 6. Input and scroll rules

- Runtime owns one wheel/touch/pointer/key/scroll listener set.
- Native reading corridors pass through and are not `preventDefault()`ed.
- A cinematic boundary may claim an intent only when the current manifest edge
  and direction match.
- A claimed physical epoch may start at most one transaction.
- Momentum/tail events from a completed epoch cannot start the next segment.
- No free-floating pending intent survives a stable commit, rollback, direct
  entry, visibility change, or route disposal.
- `scrollTo()` is an effect with command identity and one bounded correction.
  It is never a polling loop and never a stable-commit substitute.
- Contact controls, focus, pointer interaction, links, and native scrolling
  remain outside cinematic interception.

## 7. First-frame and coverage rules

### Hero

Hero progress zero is synchronously applied before the Loader can reveal the
stage. Required images decode, the stage topology is already fixed, a
post-paint proof is accepted, and only then may the Loader exit. There is no
completed-frame default and no later zero reset.

### AOD and packed-alpha scenes

`video.play()`, advancing `currentTime`, a ready dataset, or a generic RAF does
not prove a visible frame. The proof must be causally emitted by a successful
compositor draw for the active token. A dummy/no-WebGL compositor reports
failure immediately; it cannot remain silent until a long watchdog expires.

### Viewport coverage

Layout geometry and coverage geometry are separate:

- authored/ScrollTrigger layout geometry changes only on width, orientation,
  or fullscreen invalidation;
- the coverage rectangle tracks every coalesced
  `visualViewport.resize`/`scroll` sample, including `offsetLeft`,
  `offsetTop`, width, height, and scale.

No scene-specific strip, negative bottom, overscan pseudo-element, or
Pattern-only gradient may hide a failed coverage contract.

### Layering

Every segment declares whether its effect is between endpoints or above both.
The browser gate inspects actual stacking contexts and pixels. Numeric
z-index token comparison alone is insufficient.

## 8. Migration strategy

1. Keep the old `9652fbe` production phone route unchanged while the clean
   runtime is built in a DEV-only harness.
2. Add pure machine and real-browser contracts before connecting donor leaves.
3. Integrate Front/AOD, Grade A, Group 4–5, and Group 6–7 in canonical order.
4. Require a visual checkpoint after each group; do not modify the frozen
   scene/media/timing contract to make the runtime pass.
5. Switch formal `/` to the clean shell in one cutover commit.
6. In that same commit, remove the old reachable orchestration and query-based
   validation compositions. Formal `/` never mounts two authorities.
7. Add `/brand-lab` only after the shared factory is green; the QA route is
   separately lazy and absent from the formal module graph.
8. Complete physical iPhone Safari acceptance before making a release claim.

Later branches are evidence sources only. No whole commit after `9652fbe` may
be cherry-picked. Rendering fixes and tests are ported by reviewed path/hunk
against the clean APIs.

## 9. Completion definition

The design is complete only when:

- all 16 canonical holds and 15 segments pass forward and reverse transaction
  tests;
- Front/AOD, Grade A, Group 4–5, and Group 6–7 share one runtime authority;
- every stable commit has matching presentation, coverage, content, frame,
  edge, checkpoint, navigation, scroll, and input evidence;
- Hero has no Loader-to-stage flash;
- AOD fails fast or displays a proven compositor frame and always releases
  input;
- Pattern/Figure2 and every other surface pass four-edge pixel checks;
- all direct entries show target content on their first exposed frame;
- formal and QA routes share implementation but not object identity;
- old orchestration files and compatibility paths are removed;
- phone JavaScript is no larger than the clean baseline 628,044 bytes and the
  immutable 663,552-byte cap is unchanged;
- Chromium and WebKit engine gates pass;
- iOS Simulator evidence is recorded;
- a physical iPhone Safari matrix passes with toolbar movement, orientation,
  background/foreground, lock/unlock, slow media, reduced motion, rapid
  gesture, direct-entry, and two full round trips.

