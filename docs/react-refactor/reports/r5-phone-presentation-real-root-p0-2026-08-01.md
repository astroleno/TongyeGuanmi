# R5 Phone Presentation: Real-Root P0 Revocation

**Date:** 2026-08-01 (Asia/Shanghai)
**Scope:** production root routing and presentation-host stacking only
**Decision:** **Implementation NO-GO / Automated acceptance invalid / Release NO-GO**

## What is revoked

The earlier `Automated GO` claim and its Chromium/WebKit Task 10 7/7 result
are not release evidence. Those journeys entered `/?v=47`, which is a
validation-only renderer override. They did not verify the real production
mobile route at `/`.

`react-refactor-r5-parity-repair-candidate-v19` remains an immutable,
**unqualified and superseded** historical tag. Its draft manifest must not be
finalized, its CDN namespace must not be uploaded, and no physical-device or
memory claim may be attached to it.

## P0-1: production root selects the desktop shell

The root selection has two independent guards that both exclude the phone
runtime in the ordinary build:

1. `App.tsx` selects `PhoneStoryShell` only when
   `VITE_ENABLE_PHONE_STORY === '1'` and the physical presentation profile is
   phone. `?v=47` bypasses that check through `requestedPhoneValidationMode()`.
2. `index.html` preboot has the same `__PHONE_STORY_PREBOOT_ENABLED__` guard.
   The inspected production artifact contains `productionPhoneEntry = 'false'
   === 'true'`.

Consequently, a real mobile visit to `/` mounts `DesktopStoryShell` instead of
the one phone authority. The state-machine and packed-alpha evidence observed
under `?v=47` says nothing about that production route.

## P0-2: coverage is above the entire fixed stage host

`PhoneStageRail` renders the fixed `.portrait-scroll-spike__stage` as a
sibling of the opaque `.portrait-scroll-spike__stage-rail::before` coverage
plane. A fixed-position stage forms its own stacking context. The current CSS
gives the coverage sibling `z-index: 100`, but gives the stage host no root
`z-index`; child roles such as Hero `300` and effects `500–700` cannot escape
their stage context to outrank that sibling.

The pre-`14af18a` stylesheet had an explicit host relationship (`stage: 10`,
coverage: `8`). `14af18a` removed those root planes while retaining and
renaming child z-index values as if they were global. A temporary stage-host
z-index override restored the Hero title, subtitle, and Figure1 immediately,
which isolates the failure to host topology rather than four scene defects.

## Why the existing acceptance was false-positive

- Task 10 opens `/?v=47` and never a mobile `/` root.
- Its gate treats datasets, DOM visibility, geometry, and computed z-index
  values as evidence; none proves the final composited pixels are visible.
- A coverage element with `pointer-events: none` can leave all DOM checks green
  while still painting an opaque screen over the stage.

## Required recovery order

1. Freeze AOD, Figure2, Figure3, TTG, Group 6–7, media, and timings.
2. Add the real-root and pixel red gates described in the companion design
   checkpoint.
3. Establish an explicit top-level presentation-host topology; only then
   repair root production selection and enable it in the release build.
4. Re-run Chromium, WebKit, real touch, and physical iPhone evidence against
   `/`, not a validation query. A new candidate is required after all gates
   pass.

No product code was modified for this revocation.
