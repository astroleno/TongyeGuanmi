# R5 Phone Clean Runtime — Task 0 Baseline

Date: 2026-07-31 (Asia/Shanghai)

Evidence label: donor baseline only; **not** release evidence

Clean worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime`

Branch: `codex/r5-phone-clean-runtime-convergence`

This report freezes the accepted Unit 4–7A integration, audits the complete
Unit 7B delta, and records the old authority as a deletion ledger. It does not
approve any post-base lifecycle implementation and it does not claim physical
iPhone verification.

## 1. Execution identity and immutable inputs

### 1.1 Identity

| Check | Recorded result |
| --- | --- |
| `git rev-parse --show-toplevel` | `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime` |
| `git branch --show-current` | `codex/r5-phone-clean-runtime-convergence` |
| startup `HEAD` | `e70fc984920996ce2c87d2d0486a1aa042c159c8` |
| `git rev-parse 9652fbe` | `9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f` |
| `git merge-base --is-ancestor 9652fbe HEAD` | exit 0 |
| startup `git status --short` | empty |
| `git diff 9652fbe..HEAD -- app assets package.json pnpm-lock.yaml pnpm-workspace.yaml` | empty |
| `.worktrees` ignore proof | `.gitignore:6:.worktrees/` |

The two neighboring worktrees were not edited, merged, or cherry-picked.

### 1.2 Accepted ancestry

Each command exited 0:

```text
git merge-base --is-ancestor 3deb717 9652fbe
git merge-base --is-ancestor 35b0aee 9652fbe
git merge-base --is-ancestor ab7353e 9652fbe
git merge-base --is-ancestor eca6bc2 9652fbe
```

Therefore Unit 4 `3deb717`, Unit 5 `35b0aee`, Unit 6 `ab7353e`, and Unit 7A
`eca6bc2` are all contained by the clean integration point.

### 1.3 Immutable hashes

| Input | Frozen identity |
| --- | --- |
| `9652fbe:assets` tree | `19f053c0acaf6edde9137015a743be3a913444d9` |
| `app/src/story/timings.ts` | `40a542bdad8f9336ba5586a5450a1ea992794fa724915895d74a516323be88bd` |
| `assets/aod-figure-motion-rgb-alpha.mp4` | `a97af562c62e86fa4d3be9afe9537145ddeb05b67f556934985bc2dbf9f154ec` |
| `assets/figure2-pair-motion-rgb-alpha.mp4` | `d472ec0767f1d113ae8020ed232c763ba53c5821deb725660601172954bc63ef` |
| `assets/ph-figure-motion-rgb-alpha.mp4` | `39ed325feaa4afcd2c59f7479e6ad75edbe6f4f063ab2243a04afe2660c4f8e1` |
| `assets/crane-figure-motion-rgb-alpha.mp4` | `80e971968a290ab1b4176cc754acdd4aaf85fecf5137a85295ccd9e7152105f5` |
| `assets/crane-flock-motion-rgb-alpha.mp4` | `6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00` |
| `assets/figure3-initial-paper.webp` | `98724a85700755b30d050746dc48764541704481c16a4c6ae91bc466eb1c1bdd` |
| `assets/figure3-terminal-paper.webp` | `a546aa40592810cf99aa38674f201dee771e295c81fd6ee1458205f17d16fbb2` |

### 1.4 Persistent evidence archive

Review 1 found that the original formal traces lived in Playwright's ignored,
auto-cleared `app/test-results/` and the remaining evidence lived under
`/private/tmp`. Before any Task 1 browser command, all raw evidence was copied
without rerunning either donor to this persistent root:

```text
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/
  artifacts/react-refactor/r5-phone-clean-runtime-task0/
```

The archive contains **227 checksummed files / 217,091,751 bytes**. Its
`manifest.json` records the original path and persistent archive path for all
**44 report-referenced artifacts**, full identities for `e70fc984` and
`c808e06`, the tool versions above, and the recovery provenance of each saved
source. `SHA256SUMS` covers every raw artifact and preserved source. The local
`raw/` directory is deliberately ignored by Git because it is about 200 MB;
the manifest, checksum inventory, verifier, and reproduction sources are
versioned.

Preserved sources include:

- `r5-baseline-provenance.mjs`;
- the frozen `r5-phone-story.spec.ts` and release config;
- the exact supplemental recorder/config;
- the v36 recorder recovered byte-for-byte from all five traces and its
  trace-context-derived config;
- the exact `c808e06` R4 Group 6/7 specs, shared endpoint helper, and the
  donor config listed by the authoritative plan.

Verification command:

```bash
node artifacts/react-refactor/r5-phone-clean-runtime-task0/verify-evidence.mjs
```

Recorded result: `verified 44/44 report hashes; 227/227 inventory files;
217091751 bytes`.

## 2. Executable clean-base result

### 2.1 Toolchain

| Tool | Version |
| --- | --- |
| Node.js | `v25.6.1` |
| pnpm | `8.15.1` |
| Git | `2.53.0` |
| TypeScript | `5.9.3` |
| Vitest | `3.2.7` |
| Vite | `7.3.6` |
| Playwright | `1.61.1` |

### 2.2 Commands

| Command | Result | Recorded duration/output |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | pass | lockfile unchanged; Node emitted the existing `url.parse` deprecation warning |
| `pnpm -C app test` | pass | 170 files, 950 tests; Vitest 7.54 s |
| `pnpm -C app typecheck` | pass | no diagnostics |
| `pnpm -C app build` | pass | Vite 2.96 s; release verifier and manifest generation passed |

Build source commit was
`e70fc984920996ce2c87d2d0486a1aa042c159c8`. The generated release artifact
tree hash was
`987fbde46eeee62f0bd7814e0b24edea8256eabd9b4dbba6df60f959c52fe134`;
it is build output, not an immutable source input.

### 2.3 Frozen bundle measurements

| Metric | Actual | Ceiling / headroom |
| --- | ---: | ---: |
| initial JS raw | 194,989 B | 368,640 B |
| initial JS gzip | 61,487 B | 114,688 B |
| phone JS raw | **628,044 B** | 663,552 B |
| phone JS headroom | **35,508 B** | minimum required 4,096 B |
| desktop JS raw | 575,322 B | 581,632 B |
| all emitted JS raw | 931,332 B | informational |
| loader ink lazy JS | 13,598 B | 16,384 B |
| `donorMaxLazyLeafBytes` | **55,259 B** | 65,536 B |

`donorMaxLazyLeafBytes` deliberately uses the existing performance gate's
conservative “largest presentation-lazy JS chunk” definition. The owning
chunk is `story-runtime-mrc5jmK.js`; the largest direct dynamic leaf entry is
smaller (`index-BpmILMZ.js`, 17,132 B, shared Figure2 internals).

### 2.4 Largest ten chunks in the formal phone closure

The measurement used a write-disabled Vite/Rollup build and the same
`PhoneStoryShell` closure traversal as `verify-performance-budgets.mjs`.
“Owner” names the entry/facade or the direct importer that makes the shared
chunk relevant.

| Rank | Chunk | Raw B | Entry/import ownership |
| ---: | --- | ---: | --- |
| 1 | `index-BrSFg51.js` | 194,989 | eager `app/index.html`; statically imported by the selected shell and shared leaves |
| 2 | `PhoneStoryShell-D_bAsH3.js` | 132,305 | dynamic entry `app/src/production/phone/PhoneStoryShell.tsx`, selected by `index.html` |
| 3 | `story-runtime-mrc5jmK.js` | 55,259 | manual shared runtime chunk; static dependency of shell, ink, motion, and media leaves |
| 4 | `PhoneBrandLabContinuation-m6qbL-l.js` | 20,173 | static dependency of `PhoneGradeAStory` |
| 5 | `index-BpmILMZ.js` | 17,132 | shared Figure2 distance/scene internals imported by `figure2-distance-expand` |
| 6 | `PhoneFigure3-sBSHzDP.js` | 14,122 | dynamic leaf `src/scenes/figure3-animation/phone/PhoneFigure3.tsx` via `module-loaders` |
| 7 | `loader-ink-reveal-f7iqbus.js` | 13,598 | dynamic entry `production/loader-ink-reveal.ts` via `StoryLoader` |
| 8 | `patternBloomRenderer-CsoIwuk.js` | 12,697 | static visual dependency of `PhonePattern` |
| 9 | `PhoneTtg-B0WUgjL.js` | 11,552 | dynamic leaf `src/scenes/ttg-animation/phone/PhoneTtg.tsx` via `module-loaders` |
| 10 | `copy-BMuNxCx.js` | 10,761 | shared canonical copy imported by Hero, Pattern, StarMap, and Method |

Rollup's exact `OutputChunk.modules` ownership found **0 source module IDs
duplicated across the 65 emitted chunks in the phone closure**. This does not
mean the source has no copy-pasted logic; it means Rollup did not emit the
same module ID into multiple chunks.

The synchronous import closure of the formal `PhoneStoryShell` contains these
12 chunks:

```text
PhoneStoryShell-D_bAsH3.js
StoryNav-BiuiBlD.js
index-BrSFg51.js
mobile-media-unlock-hC7jdcz.js
module-loaders-B7Hly6j.js
navigation-fYCJr5n.js
phone-adapter-binding-DuO8tr7.js
phone-ink-CZ5DDYM.js
phone-stage-timeline-Ch4e0GZ.js
phone-transition-coordinator-CgwQwK9.js
story-runtime-mrc5jmK.js
usePhoneEdgeSurface-CN4zT9V.js
```

No scene or transition leaf module under
`production/phone/{scenes,transitions}`, `scenes/*/phone`, or
`transitions/*/phone.*` is reached synchronously. Formal visual leaves are
lazy, while substantial orchestration is already eager.

## 3. Exhaustive `c808e06` disposition

### 3.1 Delta identity and reconciliation

| Check | Result |
| --- | --- |
| `git rev-parse c808e06^` | `9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f` |
| exact donor commit | `c808e06144bd0368ce508001f313c801517dcdd0` |
| changed files | 56 |
| insertions | 3,302 |
| deletions | 652 |

Decision meanings:

- `port`: exact hunk may move after its independence from authority is proven.
- `rewrite`: preserve observed visual/media behavior, but implement it behind
  the clean manifest/machine/runtime/leaf ports.
- `reject`: do not move this hunk into the clean implementation.

Preserving-gate codes used below:

| Code | Required preserving test |
| --- | --- |
| `M3` | Task 3 exhaustive manifest/checkpoint/dependency-closure tests |
| `R4` | Task 4 reducer, serial queue, rollback, direct-entry, lifecycle, and disposal tests |
| `O6` | Task 6 real-React single-owner/listener/command-port tests |
| `G10A` | Task 10A Lab → PH → Education WebKit trace, pixels, real frame, forward/reverse/replay |
| `G10B` | Task 10B Education → Crane WebKit trace, two-surface pixels/frames, forward/reverse/replay |
| `G10C` | Task 10C Crane → Contact WebKit trace, copy-cue pixels, forward/reverse/replay |
| `C11` | Task 11 atomic cutover, architecture, route isolation, and release-spec migration |

### 3.2 File ledger (all 56 files)

Every `-U0` hunk belongs to the range recorded below. New files use their full
line range. The `+/-` column exactly reconciles to 3,302/652.
Ledger paths are relative to `app/src/`, except `vite.config.ts`, which is
relative to `app/`.

| # | Source path and numstat | Hunk coverage | Kind / decision | Destination and rationale / preserving gate |
| ---: | --- | --- | --- | --- |
| 1 | `production/phone/PhoneGradeAStory.tsx` `+15/-0` | `+32–35,+161,+710–719` | lifecycle / reject | Unit 7B continuation selection is a competing shell path; express the entry in `manifest.ts` and one shell at Task 11. `M3,R4,C11` |
| 2 | `production/phone/PhoneGroup67DirectEntry.css` `+8/-0` | `+1–8` | lifecycle / reject | Styling exists only for the rejected second direct-entry wrapper. `C11` |
| 3 | `production/phone/PhoneGroup67DirectEntry.tsx` `+45/-0` | `+1–45` | lifecycle / reject | Second entry/router composition; clean direct entry is reducer state. `R4,C11` |
| 4 | `production/phone/PhoneLabContactContinuation.css` `+140/-0` | `+1–140` | visual + lifecycle / rewrite | Lines 56–129 contain donor stage geometry worth reproducing through the one presentation plane; lines 1–55 and 130–140 are competing topology/authority selectors and are rejected. `G10A,G10B,G10C,O6` |
| 5 | `production/phone/PhoneLabContactContinuation.tsx` `+1022/-0` | `+1–1022` | lifecycle + visual / reject + rewrite | Reject all local state, listeners, timers, RAFs, commits, adapters, and portals. Re-express only the 831–1020 mount/plane observations through bounded clean closures. `M3,R4,O6,G10A,G10B,G10C` |
| 6 | `production/phone/PhoneStoryShell.tsx` `+47/-47` | `-9–12;+10;-14–17;+15–19;-52–53;+50–61;-76/+84;-85–87/+93;-97/+103–105;-133–134;-137–156/+143;+181;-193/+199–201;+211–212; fifteen one-line render/prop substitutions through +305–312` | lifecycle / reject | Shell surgery installs a second continuation/entry owner. Rebuild only at final atomic cutover. `O6,C11` |
| 7 | `production/phone/PhoneUnit7BIntegration.test.ts` `+130/-0` | `+1–130` | test / rewrite | Preserve scenarios as clean machine/browser assertions, not source-contract assertions. `R4,G10A,G10B,G10C` |
| 8 | `production/phone/adapter-groups/group6-7.ts` `+35/-7` | `-3–7/+3–14;-13/+20;-20/+27;+33–53` | lifecycle / reject | Partial adapter registry conflicts with the exhaustive clean registries. Preserve IDs in `manifest.ts`, not this loader group. `M3,C11` |
| 9 | `production/phone/module-loaders.test.ts` `+7/-5` | `+20–23;-71/+75;-73/+77;-76/+80;-78–79` | test / rewrite | Replace partial loader expectations with exhaustive scene/transition loader tests. `M3,C11` |
| 10 | `production/phone/module-loaders.ts` `+64/-2` | `+13–16;-41/+45–46;-46/+51–52;+140–167;+221–248` | lifecycle / reject | Old partial compatibility loader. Clean registries own one closure per manifest record. `M3,C11` |
| 11 | `production/phone/phone-edge-surface.test.ts` `+9/-1` | `+21–24;-40/+44–48` | test / rewrite | Preserve surface colors as manifest/projector/pixel assertions, not a writable edge-scene table. `M3,G10A,G10B,G10C` |
| 12 | `production/phone/phone-edge-surface.ts` `+10/-2` | `-13/+13–17;-31/+35–39` | lifecycle / reject | Competing derived edge-scene authority. Move immutable colors to the clean manifest/projector. `M3` |
| 13 | `production/phone/phone-entry-plan.test.ts` `+29/-0` | `+1–29` | test / rewrite | Preserve entry mapping as exhaustive reducer/manifest tests. `M3,R4` |
| 14 | `production/phone/phone-entry-plan.ts` `+79/-0` | `+1–79` | lifecycle / reject | Second direct-entry/query plan; clean machine owns cold/warm entry. `M3,R4,C11` |
| 15 | `production/phone/phone-gsap-driver.test.ts` `+60/-0` | `+1–60` | test / reject | Tests the rejected global GSAP driver optimization, not a visual leaf contract. `O6,C11` |
| 16 | `production/phone/phone-gsap-driver.ts` `+84/-22` | `-1/+1;+4–52;-5–7/+54;-9/+56–64;-12–27/+67–89;-29/+91` | build + lifecycle / reject | Global motion driver and alternate clock ownership are forbidden. Runtime supplies the one clock; leaves only sample commands. `R4,O6` |
| 17 | `production/phone/scenes/PhoneContact.ts` `+5/-0` | `+1–5` | lifecycle / reject | Compatibility re-export into the old adapter tree. Canonical Contact leaf remains under `scenes/contact/phone`. `G10C,C11` |
| 18 | `production/phone/scenes/PhoneCrane.ts` `+1/-0` | `+1` | lifecycle / reject | Compatibility re-export. `G10B,C11` |
| 19 | `production/phone/scenes/PhoneEducation.ts` `+5/-0` | `+1–5` | lifecycle / reject | Compatibility re-export. `G10A,G10B,C11` |
| 20 | `production/phone/scenes/PhonePh.ts` `+1/-0` | `+1` | lifecycle / reject | Compatibility re-export. `G10A,C11` |
| 21 | `production/phone/scenes/lab-contact-loaders.ts` `+4/-39` | `-5/+5;-8–12/+8–9;-17–49/+14` | lifecycle / reject | Loader indirection is replaced by exhaustive clean registries. `M3,C11` |
| 22 | `production/phone/scenes/usePhoneCinematicRun.ts` `+180/-0` | `+1–180` | lifecycle / reject | Per-leaf cinematic lifecycle is explicitly excluded; runtime owns generations, deadlines, clocks, rollback, and completion. `R4,O6` |
| 23 | `production/phone/transitions/PhoneEndpointTransition.ts` `+116/-0` | `+1–116` | visual + lifecycle / rewrite | Endpoint opacity/inert observations are useful, but the React adapter owns direction/settle. Reimplement sampling as stateless leaf commands under Task 10. `G10A,G10B,G10C,O6` |
| 24 | `production/phone/transitions/PhoneInkTransition.tsx` `+54/-40` | `-1/+1–7;+34–42;-35/+50–59;-37/+61;-42/+66;-51–55/+75–90;-57–61/+92–93;-63–75/+95–99;-77–89/+101–103` | visual + lifecycle / rewrite | Preserve field/grade/progress/release behavior through canonical ink leaves; reject imperative adapter ownership. `G10A,G10B,O6` |
| 25 | `production/phone/transitions/crane-contact.ts` `+48/-0` | `+1–48` | visual + lifecycle / rewrite | Rewrite copy-cue opacity/endpoint frame into canonical `transitions/crane-contact/phone.ts`; do not port adapter wrapper or duplicated helpers. `G10C` |
| 26 | `production/phone/transitions/education-crane.ts` `+45/-0` | `+1–45` | visual + lifecycle / rewrite | Rewrite the accepted bottom-to-top ink and stable endpoints in the canonical leaf; no adapter ownership. `G10B` |
| 27 | `production/phone/transitions/lab-contact-loaders.ts` `+6/-23` | `-5/+5;-8–11/+8–9;-16–33/+14–16` | lifecycle / reject | Old transition loader compatibility. `M3,C11` |
| 28 | `production/phone/transitions/lab-ph.ts` `+43/-0` | `+1–43` | visual + lifecycle / rewrite | Preserve bottom-to-top ink, source/receiver endpoints, and reduced-motion result; rewrite in canonical Lab → PH leaf. `G10A` |
| 29 | `production/phone/transitions/ph-education.ts` `+49/-0` | `+1–49` | visual + lifecycle / rewrite | Preserve the authored playback/dissolve split and endpoint opacity; rewrite behind clean commands. `G10A` |
| 30 | `production/phone/types.ts` `+8/-2` | `+23–26;-30/+34–35;-39/+44–45` | lifecycle / reject | Expands the obsolete adapter type union; clean protocol uses closed manifest IDs and report/command ports. `M3,C11` |
| 31 | `production/phone/usePhoneEdgeSurface.ts` `+3/-2` | `-10/+10–11;-12/+13` | lifecycle / reject | Hook writes derived edge authority; projector owns it. `M3,O6` |
| 32 | `production/phone/usePhoneFrontHalfAdapters.ts` `+18/-12` | `-120/+120–121;-122/+123–125;-128–132/+131–137;-136/+141;-155/+160;+163;-161/+167;-164/+170;-173/+179` | lifecycle / reject | Cross-group adapter handoff changes preserve no independent leaf behavior. `O6,C11` |
| 33 | `production/phone/usePhoneGroup67Adapters.test.ts` `+33/-0` | `+1–33` | test / rewrite | Replace lazy partial-registry tests with clean closure/load/failure tests. `M3,R4` |
| 34 | `production/phone/usePhoneGroup67Adapters.ts` `+120/-0` | `+1–120` | lifecycle / reject | Competing loader/focus state. Clean runtime owns one active dependency closure. `M3,R4,O6` |
| 35 | `production/phone/usePhoneStageRuntime.ts` `+17/-17` | `-1–3/+1–7;-30/+34;-117/+121;-587–598/+591–598` | lifecycle / reject | GSAP-core substitution changes the old authority clock. `R4,O6` |
| 36 | `production/phone/usePhoneStoryEntry.ts` `+94/-0` | `+1–94` | lifecycle / reject | Query/hash entry hook is a second writable story state. Clean reducer handles entry. `R4,C11` |
| 37 | `production/presentation-shell-loaders.test.ts` `+9/-2` | `-23–24/+23–31` | test / rewrite | Preserve phone shell isolation/rejection tests, but point them to the clean core/bootstrap boundary at cutover. `C11` |
| 38 | `production/presentation-shell-loaders.ts` `+21/-14` | `+1–2;-13/+15–18;-16–28/+21–35` | lifecycle / reject | Numbered validation and Unit 7B loader routing are obsolete. Task 11 separately implements the eager non-story chunk-recovery boundary. `C11` |
| 39 | `scenes/contact/phone/PhoneContact.tsx` `+56/-16` | `-8–11/+8;+16–45; four one-line helper substitutions +66,+72,+88; -104; -81/+107; -88–94/+114–134` | visual + lifecycle / reject + rewrite | Copy, markup, and progress helpers duplicate the accepted canonical Contact module; keep the base leaf. Rewrite only clean port registration/command boundary and verify terminal pixels. `G10C` |
| 40 | `scenes/crane-animation/phone/PhoneCrane.autoplay.ts` `+62/-10` | `-1;-3–7/+2–6;+16–17;+21–25;+27;+77–124;-242–245/+297` | media / rewrite | Causal two-video seek/prepare behavior is useful evidence; duplicated constants and local completion clock are not. Rebuild with registered figure/flock surfaces and runtime generation tokens. `G10B` |
| 41 | `scenes/crane-animation/phone/PhoneCrane.motion.ts` `+5/-2` | `-1/+1;+6–8;-78/+81` | visual / reject | Duplicates canonical duration/end constants only to break imports. Keep accepted canonical renderer; test its exact endpoint. `G10B` |
| 42 | `scenes/crane-animation/phone/PhoneCrane.test.tsx` `+8/-1` | `+44–50;-93/+100` | test / rewrite | Preserve “no canonical import / cinematic source” intent as clean authority/import gates, plus real two-surface pixels. `O6,G10B` |
| 43 | `scenes/crane-animation/phone/PhoneCrane.tsx` `+173/-173` | all 33 `-U0` hunks from imports through `+371–459` and portal tail | visual + media + lifecycle / rewrite | Do not port `usePhoneCinematicRun`, local run refs, completion dispatch, timers, or packed-surface authority. Preserve canonical art/media URLs, two Canvas surfaces, terminal composition, and disposal via a clean retained handle. `O6,G10B` |
| 44 | `scenes/education/phone/PhoneEducation.tsx` `+90/-17` | `-8–12;+14–37;+42–66; three helper substitutions +88,+97,+113; -129; -89/+132; -95–101/+138–174` | visual + lifecycle / reject + rewrite | Copy/markup/progress are duplicated from the accepted canonical scene. Keep base content; refactor only the stateless command/report boundary. `G10A,G10B` |
| 45 | `scenes/ph-animation/phone/PhonePh.motion.ts` `+29/-10` | `-1–5;+3–6;+10–11;+16–20;+27–31;-51/+61;-68–69/+78–82;+84–86;+89–91;-79/+98` | visual / reject | Duplicates the canonical PH renderer/constants. Keep canonical motion byte-for-behavior and test actual presented frames. `G10A` |
| 46 | `scenes/ph-animation/phone/PhonePh.reverse.ts` `+6/-6` | four import/constant substitutions at `11–16,30` | media / reject | Import reshuffle only; accepted reverse-frame behavior remains the authority. Rebind it to clean generation tokens later. `G10A` |
| 47 | `scenes/ph-animation/phone/PhonePh.test.tsx` `+10/-2` | `+31–37;-85/+92–93;-91/+99` | test / rewrite | Preserve “native clock/cinematic source” cases as clean port and real-frame tests, not source-string ownership. `O6,G10A` |
| 48 | `scenes/ph-animation/phone/PhonePh.tsx` `+126/-160` | all 29 `-U0` hunks from imports through `+328–373` and portal tail | visual + media + lifecycle / rewrite | Reject local run state, autoplay dispatch, timeout, release authority, and duplicated markup. Preserve one packed-alpha surface, real frame fallback, forward/reverse causal sampling, and exact PH composition behind clean commands. `O6,G10A` |
| 49 | `story/crane-contact-contract.test.ts` `+15/-0` | `+1–15` | test / reject | Tests a duplicated manifest cue table; clean manifest exhaustive tests replace it. `M3,G10C` |
| 50 | `story/crane-contact-contract.ts` `+7/-0` | `+1–7` | visual data / reject | Copy cue already belongs to the frozen canonical manifest; do not create a second constant. `M3,G10C` |
| 51 | `story/semantic-checkpoints.test.ts` `+14/-0` | `+6;+67–79` | test / rewrite | Preserve Group 6–7 checkpoint exhaustiveness in the clean 16/15 matrix. `M3` |
| 52 | `story/semantic-checkpoints.ts` `+15/-1` | `+50–62;-53/+66–67` | lifecycle data / reject | Extends the frozen legacy checkpoint union. Represent all records in new `phone-story/manifest.ts`; frozen old story input stays byte-identical. `M3` |
| 53 | `transitions/crane-contact/phone.ts` `+2/-15` | `-13–14/+13;-23–34;-75/+62` | visual data / reject | Replaces canonical manifest lookup with duplicated contract. Keep base lookup until clean manifest cutover. `M3,G10C` |
| 54 | `transitions/education-crane/phone.css` `+2/-0` | `+2–3` | visual / rewrite | Old `.phone-group67__stage` selector is rejected; reproduce the required ink stacking in the clean plane topology. `G10B` |
| 55 | `transitions/lab-ph/phone.css` `+2/-1` | `-6/+6–7` | visual / rewrite | Same: preserve ink placement, not the old stage selector. `G10A` |
| 56 | `vite.config.ts` `+16/-1` | `-146/+146–161` | build / reject | Property mangling and unsafe compression are explicitly forbidden donor strategy. Bundle limits must be met architecturally. `C11` |

### 3.3 Mixed-purpose hunk rules that bind later tasks

The table above is exhaustive; these rules remove any ambiguity in the
largest mixed files:

1. `PhoneLabContactContinuation.tsx` contains useful *observations* about the
   PH/Education and Crane/Contact mount geometry, but all 1,022 lines are
   implementation-ineligible. Its multiple `useState` stores, transition
   sessions, readiness sets, timers, RAF loops, scroll/resize/orientation
   listeners, completion events, direct-entry trigger, and portals are
   competing lifecycle authority.
2. `PhonePh.tsx` and `PhoneCrane.tsx` may donate no lifecycle code. Task 10
   must rewrite retained Canvas/video registration, real-frame readiness,
   pause/rebind/dispose ordering, and fallback behavior through
   `PhoneLeafReportPort`/`PhoneLeafCommandHandle`.
3. Contact/Education inline copy and markup are not donations: they duplicate
   canonical accepted modules. Their appearance is preserved by keeping the
   `9652fbe` leaves and verifying pixels.
4. Lab → PH, PH → Education, Education → Crane, and Crane → Contact endpoint
   progress/ink observations are `rewrite`, never `port`. Old React adapters
   and source/receiver state changes are rejected.
5. No `c808e06` hunk has an unconditional `port` decision. This is deliberate:
   every useful visual/media observation crosses the old adapter/lifecycle
   boundary and therefore requires a clean-port rewrite with the named gate.

### 3.4 Exact ranges for the mixed visual/media/lifecycle files

These are the exact destination-side `-U0` ranges behind the grouped ledger
rows. They prevent a later implementation from treating an unlisted portion
of a mixed file as implicitly approved:

```text
PhoneLabContactContinuation.css
  +1–140 (visual observations + lifecycle topology; split at 55/56 and 129/130)
PhoneLabContactContinuation.tsx
  +1–1022 (lifecycle rejected; mount/plane observations only at +831–1020)

PhoneInkTransition.tsx
  +1–7,+34–42,+50–59,+61,+66,+75–90,+92–93,+95–99,+101–103
  visual sampling/release observations = rewrite; React adapter ownership = reject

scenes/contact/phone/PhoneContact.tsx
  +8,+16–45,+66,+72,+88,+107,+114–134
  duplicated copy/progress/markup = reject; clean stateless boundary = rewrite

scenes/education/phone/PhoneEducation.tsx
  +14–37,+42–66,+88,+97,+113,+132,+138–174
  duplicated copy/progress/markup = reject; clean stateless boundary = rewrite

scenes/crane-animation/phone/PhoneCrane.autoplay.ts
  +2–6,+16–17,+21–25,+27,+77–124,+297
  two-surface prepare facts = rewrite; duplicated constants/local clock = reject
scenes/crane-animation/phone/PhoneCrane.motion.ts
  +1,+6–8,+81
  duplicated canonical constants/import substitution = reject
scenes/crane-animation/phone/PhoneCrane.tsx
  +10,+24,+33,+41–78,+139–142,+150–152,+186,+202,+208,+228,
  +230–240,+242–245,+247–248,+264,+268,+270,+280,+283,+289–290,
  +296,+314,+320,+332,+335,+351,+354,+361,+371–459 and portal tail
  canonical art/media/two-Canvas presentation = rewrite;
  run refs/hooks/completion/listeners/release authority = reject

scenes/ph-animation/phone/PhonePh.motion.ts
  +3–6,+10–11,+16–20,+27–31,+61,+78–82,+84–86,+89–91,+98
  duplicated canonical motion = reject
scenes/ph-animation/phone/PhonePh.reverse.ts
  import/constant substitutions at destination lines 11–16 and 30
  import reshuffle = reject; accepted reverse behavior stays at base
scenes/ph-animation/phone/PhonePh.tsx
  +10,+28,+30,+42–58,+91–97,+112–113,+137,+144,+149,+171,
  +173–176,+178–179,+181–193,+195–203,+221,+226,+229,+233,+239,
  +242,+248–249,+255,+273,+284,+291,+294,+308,+311,+318,+328–373
  and portal tail
  canonical media/Canvas presentation = rewrite;
  local cinematic/autoplay/timeout/release authority and duplicated markup = reject

production/phone/transitions/lab-ph.ts
  +1–43: ink/endpoint sample = rewrite; adapter wrapper = reject
production/phone/transitions/ph-education.ts
  +1–49: authored split/endpoint sample = rewrite; adapter wrapper = reject
production/phone/transitions/education-crane.ts
  +1–45: ink/endpoint sample = rewrite; adapter wrapper = reject
production/phone/transitions/crane-contact.ts
  +1–48: copy-cue/endpoint sample = rewrite; duplicated cue/helpers/adapter = reject

transitions/crane-contact/phone.ts
  +13,+62 with deletions at old 13–14,23–34,75: duplicated cue = reject
transitions/education-crane/phone.css
  +2–3: clean-topology placement = rewrite; `.phone-group67__stage` = reject
transitions/lab-ph/phone.css
  +6–7 replacing old 6: clean-topology placement = rewrite;
  `.phone-group67__stage` = reject
```

## 4. Unit 4–7A formal-route donor evidence

### 4.1 Existing-suite run

Command:

```text
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit \
  --trace=on
```

Result: 9 discovered; 2 passed, 4 failed, 3 skipped; 1.7 minutes.

Passed:

- `v46 keeps one Pattern plate inside the stable visual canvas`
- `v47 reduced motion reaches stable Lab and reverses without another stage`

Failures are recorded as donor defects and are **not** normalized into the
clean target:

- Route B AOD reverse expected `aod-stage`, but the old route remained in
  `aod-autoplay`/`aod-to-method`.
- Proof → Brand stopped at the stale precondition expecting zero Lab mounts;
  the old continuation already mounted one Lab.
- full-motion Figure3/TTG expected a visual-run diagnostic but received
  `null`.
- downstream Services direct entry reached the checkpoint but exposed
  opacity `0` instead of `1`.

Skipped by project conditions:

- Grade A direct-entry Figure2 test (desktop-only)
- independent `/brand-lab` QA test (desktop-only)
- Figure2 no-frame fallback (desktop-only)

### 4.2 Formal trace hashes

All paths in the evidence tables are relative to the persistent archive root
defined in §1.4. The manifest retains each original path.

| Test trace | SHA-256 |
| --- | --- |
| `raw/clean-worktree/app/test-results/r5-phone-story-v46-keeps-o-dea85-de-the-stable-visual-canvas-mobile-webkit/trace.zip` | `20b62fc930f56203bdcbe88975dd12459b0c6c9d12cd586de13968f15480bdb6` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v23-Route-B-55485-nt-trace-in-both-directions-mobile-webkit/trace.zip` | `7363ddb79f9708b718ad941bf3d755963b279d113e7e1f057841fd2556a91bee` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v46-Grade-A-6c07b-thod-in-the-persistent-host-mobile-webkit/trace.zip` | `a4fabd5ded1201eea6627ad6541ffc533104bf2d2d712b2ec0f473ca91275d1e` |
| `raw/clean-worktree/app/test-results/r5-phone-story-brand-lab-Q-f7c4c--at-the-stable-Lab-boundary-mobile-webkit/trace.zip` | `be47f7db3d0e9e58a98ab55d8a2bf4f278d1e81b1b1de31351dc3c5bba7a2c23` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v47-Proof-h-e716c-de-the-one-persistent-stage-mobile-webkit/trace.zip` | `ae2a8454de5aa05b7ce5a48418c89abb1400cd4d6fd7805a28b0e0c2317eb370` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v47-full-mo-73de3--reverse-on-the-shared-host-mobile-webkit/trace.zip` | `d804f5ae03876c9516c78a58f94036b73b7169bbc0e7a95267cc1252fd0603ed` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v47-full-mo-448f6-ve-readings-without-Figure1-mobile-webkit/trace.zip` | `bf7378ea02c3435ee4d5dd7c620719031839eec12daa76ef83c78e0ee4be23f4` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v47-reduced-838ab-erses-without-another-stage-mobile-webkit/trace.zip` | `5961a2999c38cee8548ac3f07d9c2358707c32c378b9476476f812481e292ace` |
| `raw/clean-worktree/app/test-results/r5-phone-story-v46-keeps-F-b3432-oduces-a-packed-video-frame-mobile-webkit/trace.zip` | `3fc74f5e2bb87c99f32a1e53dc5a63ab27cd7ed4bebc1da466042a60bd9dc68d` |

### 4.3 Extracted accepted reference frames

Trace screencast frames were extracted only for states actually reached. The
stale Lab-count assertion stopped the stock Proof → Brand test before its
scroll. A supplemental **donor-only** WebKit recorder repeated the exact
existing helper geometry after that stale assertion and captured the three
Proof → Brand checkpoints without changing repository source. Its trace is:

```text
raw/private-tmp/r5-phone-clean-runtime-task0-evidence/formal/supplemental-results/
  formal-route-reference-rec-49830-t-its-stale-mount-assertion-supplemental-mobile-webkit/trace.zip
SHA-256 1f28856cd1fa80649895a8f1ba157c21e9f9b1f4858f307d662f7d9f338f1299
```

The recorder passed 1/1 in 11.6 s. It is reference capture, not a release
test. Selected frames are under
`raw/private-tmp/r5-phone-clean-runtime-task0-evidence/formal/reference-frames/selected/`:

| Reached hold/segment | File | SHA-256 |
| --- | --- | --- |
| Hero entered | `hero-entered.jpeg` | `f49a5782440b9d6a47b2582d7ba2bc50a99db52b010e5e428132878782daecdb` |
| Pattern complete | `pattern-complete.jpeg` | `860e34274df11b561f8bb1722bb89f39fd4a9aaedf958b7b24136e1d8fd26492` |
| Pattern stable edge/coverage | `pattern-stable-edge.jpeg` | `59fa66f9f2655b97923bc09ee7124dbb382e7ef9cc0df336bd5080a5310919e6` |
| Star Map reading | `star-map-reading.jpeg` | `38f99ab24957418912f55bca33dc73898acfb1d0a3aeb3a0d40bc773ba03a13d` |
| AOD stage | `aod-stage.jpeg` | `02b605825ef8a3c2789d12de9a7c5673213688db66be575c2d846f1544e6fc3a` |
| Method intro | `method-intro.jpeg` | `36a35d02d0a8505edc577d1304217fc1762b5a8e792766fd0a51b4af93584458` |
| Figure2 Proof closing | `figure2-proof-closing.jpeg` | `55991c58b47d273025cb17c5695b9fef4dbf802c855029b804468b9585b09d4e` |
| Proof → Brand midpoint | `proof-to-brand-midpoint.jpeg` | `0409b1b02584b50ed13b8656c7cf79626a0f279a780aedf9eb4006b5aa675968` |
| Brand reading | `brand-reading.jpeg` | `d6832cf7c6183ada74e7098791f0227de5daf507a175e28a2e12eb5830cddaa5` |
| Figure3 reduced endpoint | `figure3-reduced-endpoint.jpeg` | `e44a45228c3c9c7a3e96a15ceff4ae6038ad89abc5bea4ba8463c6179152bb6b` |
| TTG reduced endpoint | `ttg-reduced-endpoint.jpeg` | `4af7f740b80974997b077db1a45fba5b4f56ea4262612055e4b4cff6f3d28773` |
| Lab stable | `lab-stable.jpeg` | `3b5e1be85fcc8c9c42db191020d6a74b6b2b7fbac03e0b371cf8ab0e1d3fce95` |

`app/e2e/r5-phone-story.spec.ts` is byte-unchanged between `9652fbe` and
`c808e06`. It tests the formal Unit 4–7A route and does **not** prove the
independent v36 Lab–Contact shell. Neither the stock run nor the supplemental
checkpoint recorder may be called a complete 16-hold donor trace.

## 5. Detached Unit 7B Group 6–7 evidence

### 5.1 Isolation and build

A disposable detached worktree was created at exact commit
`c808e06144bd0368ce508001f313c801517dcdd0`:

```text
/private/tmp/r5-phone-c808-donor
```

Dependencies installed with the frozen lockfile. The plan's literal command
at the time of the capture,

```text
VITE_ENABLE_HARNESS=1 pnpm -C /private/tmp/r5-phone-c808-donor/app build
```

emitted the Vite build and then failed the donor's post-build production
verifier because the requested harness intentionally contains
`Group1Harness`, while `verify-release-build.mjs` forbids that marker. This is
a donor build-script contradiction, not a clean-branch failure. The harness
artifact was then produced with the underlying exact Vite build:

```text
VITE_ENABLE_HARNESS=1 pnpm -C /private/tmp/r5-phone-c808-donor/app exec vite build
```

Result: 308 modules, pass, 3.67 s. No donor production file was changed.
The authoritative plan now names `pnpm ... typecheck` followed by this raw
Vite command as the only donor-harness build path. It explicitly forbids the
package `build` wrapper in harness mode, so a later executor cannot mistake
the already-proved verifier rejection for a new baseline failure.

### 5.2 R4 WebKit discovery and execution

An untracked donor-only config used `iPhone 15 landscape`, WebKit, one worker,
port 4173, and `testMatch=/r4-g[67]\.spec\.ts/`.

Discovery found exactly **7 tests** across `r4-g6.spec.ts` and
`r4-g7.spec.ts`. Execution result: 3 passed, 4 failed, 36.6 s.

Commands:

```text
pnpm -C /private/tmp/r5-phone-c808-donor/app exec playwright test \
  --config=playwright.donor.config.ts \
  e2e/r4-g6.spec.ts e2e/r4-g7.spec.ts \
  --project=donor-mobile-webkit --list

pnpm -C /private/tmp/r5-phone-c808-donor/app exec playwright test \
  --config=playwright.donor.config.ts \
  e2e/r4-g6.spec.ts e2e/r4-g7.spec.ts \
  --project=donor-mobile-webkit --trace=on
```

Passed:

- Group 6 reverse restores the canonical terminal frame.
- Group 6 reduced motion and 0→1→0→1 replay.
- Group 7 reduced motion and 0→1→0→1 replay.

Donor failures, retained as RED requirements:

- Group 6 forward did not publish the expected PH reveal/progress-zero
  contract before timeout.
- Group 6 recovery expected Lab but remained at PH animation.
- Group 7 forward did not observe Education → Crane reveal.
- Group 7 recovery expected Education but remained at Crane animation.

| R4 trace | SHA-256 |
| --- | --- |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g6-R4-group6-Lab-PH-and-0936c-d-timeout-and-supports-seek-donor-mobile-webkit/trace.zip` | `894a1bb73af1ba63e7b7bb1103854458e89a366e276c2a2945647b1133b7b19e` |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g6-R4-group6-Lab-PH-and-29fa7-ent-0-to-1-to-0-to-1-replay-donor-mobile-webkit/trace.zip` | `74f81cbe95cf816a3ec46b05549bd515f5882c4a27fd60412106fcd940483837` |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g6-R4-group6-Lab-PH-and-a734a-then-hands-off-to-Education-donor-mobile-webkit/trace.zip` | `70fcdfed08562dff41662f8b0340e2af8e98c421ea020d8cb70debe045c04a76` |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g6-R4-group6-Lab-PH-and-aea63-e-on-the-same-media-surface-donor-mobile-webkit/trace.zip` | `164be51d0e6e73cbd1fb737dc8c566f5927eda1cacd1dca39205994b4af53ab7` |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g7-R4-group7-education--242b5-and-0-to-1-to-0-to-1-replay-donor-mobile-webkit/trace.zip` | `eae1ee1914fca48a5f71c5a2159a465d0604c6b6841c057ac7361ae1a8314f1a` |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g7-R4-group7-education--2dea0-ith-nonblank-sampled-frames-donor-mobile-webkit/trace.zip` | `aa3c7e77dfb19c45edc88d772657461e101328c67bd2ce6ad56e26c5c55f4663` |
| `raw/private-tmp/r5-phone-c808-evidence/r4/r4-g7-R4-group7-education--c1a0f-d-timeout-and-supports-seek-donor-mobile-webkit/trace.zip` | `ad40c2b589bc59b16ee87c46e338c3a4c696404cec11d57cba6c466028bdb088` |

### 5.3 Separate v36 hold captures

A second donor-only WebKit recorder loaded `/?v=36#lab`,
`#ph-animation`, `#education`, `#crane-animation`, and `#contact`. Result:
5/5 passed in 6.9 s. Each capture includes a PNG, trace, and video.

Command:

```text
pnpm -C /private/tmp/r5-phone-c808-donor/app exec playwright test \
  --config=playwright.v36-donor.config.ts \
  e2e/v36-donor-capture.spec.ts \
  --project=donor-v36-mobile-webkit --trace=on
```

| Hold | PNG / trace / video SHA-256 |
| --- | --- |
| Lab | `af5c4ee5f2ef96fe392997187a02893ff98b27cb8a5b95dacfaa3570e4969f1e` / `48b8efbf94ca0b55dbf80165791ebcbc6349a833c57f35055adda45b75deb145` / `99a4bb8f09c560b836cd246288166522765b0cc91a192d758cdf3f2ca65534cf` |
| PH | `7a36814c3ad40fe358dac35dbb4cc99359966fdcadbdc314e99b1764f7b33b1e` / `4646a3677f4077c9fcb933b6afe9742704c692e1e4359fbe12e37b5b9d4403dc` / `238d5c4b9cb7199ddfe6a35a15a34eb13ff655b78eb76cb9fdb15647455a8bc2` |
| Education | `04ab6da828d6c9a20f26b224fd82e1c31dacfa6b93a17317c0b572d37b1f060f` / `d760131eb0776440826d55c86b03645fd16674d29036916c17d38b0a5c9842aa` / `3d96eece0669835b2b2f3373d8a8506b49504f389478f0ddf9eb62a7b9b67807` |
| Crane | `976719cafcf0869e89d7b8ea374eff0200e86023f27c4733615fb984ed20f438` / `9fbfb6ea19e9d6aa499d329c42dcfcab8774370103001bc1d7a7aea2868597f7` / `15ee6e15f917b1b6da8704d28c1f2d5c42331ceb0d251c9d0db7d738737c2b70` |
| Contact | `fa0eb72c8745764891a4d727b336e11d61d1a6e05df8002d4be3d06c10ec8983` / `9a9874878d816483bec0092faf6113d4ca153d14320c1a6362d5b81674fd93f6` / `0e2fded8f9e1c06cfd2b4698df0853f549d078ae8af57b80bfd4878454c2ad87` |

Exact artifact directories:

```text
raw/private-tmp/r5-phone-c808-evidence/v36/v36-donor-capture-captures-v36-lab-donor-v36-mobile-webkit/
  lab.png
  trace.zip
  video.webm
raw/private-tmp/r5-phone-c808-evidence/v36/v36-donor-capture-captures-v36-ph-animation-donor-v36-mobile-webkit/
  ph-animation.png
  trace.zip
  video.webm
raw/private-tmp/r5-phone-c808-evidence/v36/v36-donor-capture-captures-v36-education-donor-v36-mobile-webkit/
  education.png
  trace.zip
  video.webm
raw/private-tmp/r5-phone-c808-evidence/v36/v36-donor-capture-captures-v36-crane-animation-donor-v36-mobile-webkit/
  crane-animation.png
  trace.zip
  video.webm
raw/private-tmp/r5-phone-c808-evidence/v36/v36-donor-capture-captures-v36-contact-donor-v36-mobile-webkit/
  contact.png
  trace.zip
  video.webm
```

These v36 and R4 artifacts are independent evidence donors. They are neither
formal-route evidence nor runtime donors.

After all paths and hashes above were recorded, the disposable
`/private/tmp/r5-phone-c808-donor` worktree was removed. Its evidence is now
preserved under the §1.4 archive and no longer depends on `/private/tmp`.

## 6. Existing R5 release-suite disposition

`playwright.release.config.ts --list` discovered exactly 212 tests: 53 tests
in each of `desktop-chromium`, `desktop-webkit`, `mobile-chromium`, and
`mobile-webkit`.

Per project:

| Existing spec | Tests/project | Final disposition |
| --- | ---: | --- |
| `r5-production.spec.ts` | 23 | `split-by-project`: keep desktop `.story-app` assertions; rewrite every phone assertion to clean diagnostic/pixel contracts |
| `r5-performance.spec.ts` | 2 | `split-by-project`: keep desktop timing assertions; rewrite phone closure/resource checks against clean authority |
| `r5-homepage-media.spec.ts` | 6 | `split-by-project`: keep shared inventory/decode checks; phone route/visibility checks use clean diagnostics |
| `r5-crane-media.spec.ts` | 1 | `rewrite-phone-diagnostics`: retain real Crane media/frame acceptance, bind it to registered clean leaf surfaces |
| `r5-ttg-alpha.spec.ts` | 2 | `split-by-project`: preserve real-frame/alpha checks; replace phone lifecycle diagnostics |
| `r5-matrix.spec.ts` | 9 | `split-by-project`: keep desktop matrix; replace phone rows with clean entry/viewport matrix |
| `r5-phone-story.spec.ts` | 9 | `replace-with-clean-spec`: retain visual expectations and migrate them into clean runtime/presentation specs; retire numbered query routing at cutover |
| `r5-nojs.spec.ts` | 1 | `split-by-project`: retain static/no-JS coverage by route/profile without legacy phone mode |
| `r5-helpers.ts` | shared | `split-by-project`: keep `BrowserStorySnapshot`, `.story-app`, and `window.__storyApp` only in desktop helpers; phone helper calls become clean read-only diagnostics and screenshot pixels |

The old desktop diagnostic API occurs only in:

```text
r5-helpers.ts
r5-matrix.spec.ts
r5-performance.spec.ts
r5-production.spec.ts
```

Every occurrence was audited. No phone project may keep it or hide the
mismatch with a runtime skip.

Expected Task 11 project-to-spec matrix:

| Release project | Live spec assignment after cutover |
| --- | --- |
| `desktop-chromium`, `desktop-webkit` | desktop halves of production, performance, homepage-media, matrix, no-JS, TTG/Crane where desktop-relevant; desktop-only helper may retain `__storyApp` |
| existing landscape `mobile-chromium`, `mobile-webkit` | presentation-profile/preboot/orientation/no-JS and applicable shared media checks; no legacy numbered story composition |
| `phone-portrait-chromium`, `phone-portrait-webkit` | `r5-phone-clean-runtime.spec.ts`, `r5-phone-clean-presentation.spec.ts`, migrated `r5-phone-story.spec.ts`, and phone halves of production/performance/homepage-media/Crane/TTG/matrix/no-JS using clean diagnostics/pixels |

Every live file must be statically assigned to at least one project and
reconciled with `--list` during Task 11.

## 7. Initial file/authority deletion ledger

### 7.1 Count

The exact Task 0 command finds 110 TS/TSX/CSS files because it includes 34
tests. There are **76 non-test production files**. The design's “76 files”
therefore refers to production runtime source, not the complete test-inclusive
inventory.

### 7.2 All 76 non-test production paths

```text
app/src/production/phone/PhoneBrandLabContinuation.tsx
app/src/production/phone/PhoneBrandLabStory.css
app/src/production/phone/PhoneBrandLabStory.tsx
app/src/production/phone/PhoneGradeAStory.css
app/src/production/phone/PhoneGradeAStory.tsx
app/src/production/phone/PhoneLabContactShell.css
app/src/production/phone/PhoneLabContactShell.tsx
app/src/production/phone/PhoneStageRail.css
app/src/production/phone/PhoneStageRail.tsx
app/src/production/phone/PhoneStoryShell.css
app/src/production/phone/PhoneStoryShell.tsx
app/src/production/phone/PhoneTransitionCoordinator.css
app/src/production/phone/adapter-groups/front-half.ts
app/src/production/phone/adapter-groups/grade-a.ts
app/src/production/phone/adapter-groups/group4-5-native-autoplay.ts
app/src/production/phone/adapter-groups/group4-5.ts
app/src/production/phone/adapter-groups/group6-7.ts
app/src/production/phone/aod-autoplay.ts
app/src/production/phone/hero-motion.ts
app/src/production/phone/lab-contact-types.ts
app/src/production/phone/module-loaders.ts
app/src/production/phone/phone-adapter-binding.ts
app/src/production/phone/phone-edge-surface.ts
app/src/production/phone/phone-gsap-driver.ts
app/src/production/phone/phone-horizontal-pan-guard.ts
app/src/production/phone/phone-ink.ts
app/src/production/phone/phone-lab-contact-reverse-gesture.ts
app/src/production/phone/phone-lab-contact-snap-lock.ts
app/src/production/phone/phone-lab-contact-timeline.ts
app/src/production/phone/phone-loader-lifecycle.ts
app/src/production/phone/phone-media.ts
app/src/production/phone/phone-native-autoplay.ts
app/src/production/phone/phone-presented-reverse-playback.ts
app/src/production/phone/phone-scroll-snap-lock.ts
app/src/production/phone/phone-stage-timeline.ts
app/src/production/phone/phone-transition-coordinator.ts
app/src/production/phone/phone-transition-stage.ts
app/src/production/phone/phone-viewport.ts
app/src/production/phone/scenes/PhoneAod.css
app/src/production/phone/scenes/PhoneAod.tsx
app/src/production/phone/scenes/PhoneBrandLabScope.tsx
app/src/production/phone/scenes/PhoneFigure2.css
app/src/production/phone/scenes/PhoneFigure2.tsx
app/src/production/phone/scenes/PhoneFigure2Arch.tsx
app/src/production/phone/scenes/PhoneFigure2Proof.css
app/src/production/phone/scenes/PhoneFigure2Proof.tsx
app/src/production/phone/scenes/PhoneHero.css
app/src/production/phone/scenes/PhoneHero.motion.ts
app/src/production/phone/scenes/PhoneHero.tsx
app/src/production/phone/scenes/PhoneLoader.tsx
app/src/production/phone/scenes/PhoneMethodTop.css
app/src/production/phone/scenes/PhoneMethodTop.tsx
app/src/production/phone/scenes/PhonePattern.css
app/src/production/phone/scenes/PhonePattern.tsx
app/src/production/phone/scenes/PhoneStarMap.css
app/src/production/phone/scenes/PhoneStarMap.tsx
app/src/production/phone/scenes/lab-contact-loaders.ts
app/src/production/phone/scenes/phone-packed-alpha-surface.ts
app/src/production/phone/transitions/PhoneInkTransition.tsx
app/src/production/phone/transitions/aod-method-top.ts
app/src/production/phone/transitions/figure2-distance-expand.tsx
app/src/production/phone/transitions/figure2-proof-brand.ts
app/src/production/phone/transitions/hero-pattern.tsx
app/src/production/phone/transitions/lab-contact-loaders.ts
app/src/production/phone/transitions/method-bottom-figure2.ts
app/src/production/phone/transitions/pattern-star-map.tsx
app/src/production/phone/transitions/star-map-aod.tsx
app/src/production/phone/types.ts
app/src/production/phone/usePhoneEdgeSurface.ts
app/src/production/phone/usePhoneFixedStageRegistration.ts
app/src/production/phone/usePhoneFrontHalfAdapters.ts
app/src/production/phone/usePhoneGradeAAdapters.ts
app/src/production/phone/usePhoneGroup45Adapters.ts
app/src/production/phone/usePhoneLabContactFixedStageRegistration.ts
app/src/production/phone/usePhoneStageRuntime.ts
app/src/production/phone/usePhoneViewportGeometry.ts
```

### 7.3 The 34 adjacent old source-contract tests

```text
PhoneBrandLabStory.test.ts
PhoneBrandLabStory.visual-contract.test.ts
PhoneGradeAStory.test.ts
PhoneLabContactShell.test.tsx
adapter-groups/group4-5-native-autoplay.test.ts
adapter-groups/group4-5.test.ts
adapter-groups/group6-7.test.ts
module-loaders.test.ts
phone-adapter-binding.test.ts
phone-edge-surface.test.ts
phone-horizontal-pan-guard.test.ts
phone-lab-contact-reverse-gesture.test.ts
phone-lab-contact-snap-lock.test.ts
phone-lab-contact-timeline.test.ts
phone-loader-lifecycle.test.ts
phone-native-autoplay.test.ts
phone-presentation-contract.test.ts
phone-presented-reverse-playback.test.ts
phone-scroll-snap-lock.test.ts
phone-stage-timeline.test.ts
phone-transition-coordinator.test.ts
phone-transition-stage.test.ts
phone-viewport.test.ts
scenes/PhoneFigure2.test.tsx
scenes/PhoneFigure2Proof.test.tsx
scenes/PhoneHero.test.tsx
scenes/PhonePattern.test.tsx
scenes/phone-packed-alpha-surface.test.ts
transitions/grade-a-transitions.test.ts
transitions/hero-pattern.test.tsx
usePhoneFixedStageRegistration.test.ts
usePhoneFrontHalfAdapters.test.ts
usePhoneGroup45Adapters.test.ts
usePhoneLabContactFixedStageRegistration.test.ts
```

These tests are behavior donors only. Task 11 deletes obsolete
source-contract tests after their required behavior exists in clean unit,
architecture, and browser gates.

### 7.4 Disposition categories

| Category | Initial paths/responsibility | Final action |
| --- | --- | --- |
| genuine visual leaves | old Front/Grade A `scenes/PhoneHero`, Pattern, StarMap, AOD, Method, Figure2, Figure2Proof and their scene CSS/motion; authored transition files | relocate/refactor into canonical `scenes/*/phone` and `transitions/*/phone.*` in Tasks 7–8; delete old locations at Task 11 |
| shell/stage/lifecycle authority | five shells/continuations, `PhoneStageRail`, transition coordinator/stage, `usePhone*`, GSAP/snap/horizontal/reverse/timeline/viewport modules | delete; behavior is replaced by one machine/runtime/projector |
| compatibility/query/adapter | adapter groups, module/lab-contact loaders, types, `PhoneBrandLabScope`, binding/edge tables | delete; exhaustive manifest/registries and one route entry replace them |
| media/render support | old `phone-media`, packed-alpha surface, AOD/native/reverse playback helpers | move only genuine stateless rendering/resource behavior; delete lifecycle ownership |
| tests | 34 files listed above | migrate behavioral assertions, then delete source-contract tests with old directory |

The authority search matched 271 occurrences across 41 files. The densest
owners were:

```text
PhoneLabContactShell.tsx                 35
PhoneBrandLabContinuation.tsx            23
PhoneGradeAStory.tsx                     19
PhoneStoryShell.tsx                      16
phone-stage-timeline.ts                  13
phone-native-autoplay.ts                 13
adapter-groups/group4-5-native-autoplay  11
usePhoneEdgeSurface.ts                   10
aod-autoplay.ts                          10
phone-transition-coordinator.ts           8
phone-lab-contact-reverse-gesture.ts       8
```

Multiple stores/listeners/RAFs/timers/checkpoint and edge writers are the
reason this inventory is a **deletion ledger**, not a target architecture.

## 8. Frozen-input review command

Run this exact command after every task:

```bash
git diff --exit-code 9652fbe -- \
  assets \
  app/scripts/homepage-media-contract.mjs \
  app/src/story/timings.ts \
  app/src/story/copy.ts \
  app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts \
  app/src/story/spine.ts \
  app/src/story/media.ts
```

## 9. Task 0 conclusion

- Branch, worktree, donor ancestry, and immutable hashes match the plan.
- Baseline tests, typecheck, and build are green at the expected counts and
  bundle size.
- The bundle provenance, eager reachability, and exact module-duplication
  inventory are recorded.
- All 56 `c808e06` files and all mixed-purpose hunks are dispositioned; totals
  reconcile to 3,302 insertions and 652 deletions.
- All eight current R5 release specs and the shared helper have a final
  project/cutover disposition.
- Unit 4–7A formal evidence and detached Unit 7B v36/R4 evidence are separate
  and accurately scoped.
- All 44 cited traces/frames/videos and their reproduction sources are
  preserved outside Playwright output and `/private/tmp`; the unified archive
  verifier passes 44/44 report hashes and 227/227 inventory files.
- No production source has changed.

Task 1 is not authorized by this report. Execution stops at Review 1.

## 10. 2026-08-09 P0 continuity acceptance update

This section is a later execution record. It does not rewrite the historical
Task 0 baseline above.

Status: **automated acceptance complete; physical iPhone acceptance pending**.
The branch must not be described as P0-complete until the physical matrix in
section 10.4 is accepted.

This status was superseded by the correctness-review reopening recorded in
section 11.

### 10.1 Candidate identity

| Field | Recorded value |
| --- | --- |
| Worktree | `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime` |
| Branch | `codex/r5-phone-clean-runtime-convergence` |
| Base `HEAD` | `fef2af87de9f14466b28de37a9910e8f442ed070` |
| Source state | uncommitted implementation and acceptance changes; no commit or PR created |
| Automated acceptance date | 2026-08-09 (Asia/Shanghai) |

### 10.2 Implemented P0 contracts

- Brand → Figure3 and Figure3 → Brand commit the decoded static initial poster.
  Figure3 video/Canvas ownership is reserved for Figure3 ↔ Services, which keeps
  the authored 2.6-second playback and bounded rollback behavior.
- Hero preboot, document, shell coverage, and stable edge ownership use
  `#040807`; the cold path no longer begins on `#07110e`.
- Figure2 forward media plays to 2.6 seconds, then remains paused at that frame
  through dwell and z-depth. Reverse staging holds the same boundary before the
  authored reverse media leg.
- Reduced-motion Figure2 cold entry uses its decoded static poster without a
  media CTA, while reduced cinematic segments retain their required endpoint
  proof and skip only playback sampling.
- Direct media-entry browser tests now honor the manifest's covered activation
  fallback rather than assuming muted WebKit autoplay always succeeds.
- Transition-chunk fail-closed results remain bound to the failed transaction
  and stable rollback anchor; boot, prewarm, cached rejection, lifecycle
  replacement, and manual recovery paths remain covered.

### 10.3 Automated acceptance matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| Production build, typecheck, architecture, media inventory, release verification, budgets | pass | `pnpm --dir app build`; phone JS 642,436 B, 21,116 B hard-cap headroom |
| Serialized Vitest | pass | 176 files, 1,313 tests, 76.42 s |
| Phone portrait WebKit full suite | pass | 94/94 tests, one worker, 10.2 min |
| Complete story endurance | pass | 60 forward/reverse segment traversals, one authority, no resource growth; final full-suite run 2.8 min |
| Brand/Figure3 cycle | pass | static incoming poster, outgoing/reverse media, failure rollback, two-cycle resource stability |
| Figure2 staged media | pass | paused at approximately 2.6 s throughout dwell/z-depth; stable checkpoint preserved |
| Hero cold continuity | pass in controlled WebKit | preboot token, bottom edge, Loader handoff, and toolbar-sized resize assertions |
| PH/Crane lifecycle | pass | direct activation, Canvas proof, context loss, visibility, BFCache, orientation, and replay |
| Reduced motion | pass | Figure2 direct static proof and Hero → Pattern terminal proof; no visible activation CTA |
| Chunk recovery | pass | delayed/cached rejection, one bounded reload, rollback, fail-closed, and accessible manual retry |
| Whitespace/error check | pass | `git diff --check` |

Additional stability evidence gathered while resolving WebKit pressure:

- the Group 4–5 two-cycle test passed three independent repeat runs and both
  later full-suite runs;
- the complete 60-segment story passed four completed runs, including the final
  94-test suite;
- the reduced-motion direct target passed three consecutive focused WebKit runs
  after the cold-entry fix.

### 10.4 Mandatory physical-iPhone acceptance

No physical device was available to this execution environment. Fill and accept
this matrix on a genuinely cold Safari tab with the toolbar expanded:

| Scenario | Required observation | Status |
| --- | --- | --- |
| Device identity | Record iPhone model, iOS version, Safari build, orientation, toolbar state, reduced-motion state, URL, and candidate identity | pending |
| Cold Hero | No bottom color band before React, during Loader handoff, after stable commit, or on the first toolbar resize | pending |
| Brand ↔ Figure3 ↔ Services | Two forward/reverse cycles; no rollback loop, CTA, blank frame, replay, or soft poster/Canvas swap | pending |
| Figure2 ↔ Proof | Forward and reverse media/stage sequence; dwell and z-depth visibly hold the 2.6-second terminal frame | pending |
| Original visual regressions | No A/B flash, Figure2 ghosting/arch blur, Figure3 softness, or viewport bounce | pending |

Automated WebKit establishes the state, ownership, decode, frame, rollback, and
resource contracts. It does not prove the final physical-device appearance.

## 11. 2026-08-09 correctness-review implementation and remaining asset gate

This section supersedes section 10's readiness status.

Status: **three runtime findings closed; the Figure3 motion-resolution finding
and physical-iPhone acceptance remain blocking**. Automated acceptance may be
used for functional review, but the branch must not be described as visually or
P0-complete.

### 11.1 Correctness fixes

- The `vite:preloadError` controller now recognizes native `Error` payloads
  through `message`/`cause`, only prevents the browser default after proving
  that the failed URL belongs to the phone core, and leaves unknown or leaf
  preload failures observable.
- Figure3 separates replay-safe effect cleanup from hard decoder retirement.
  StrictMode effect replay keeps the motion sources intact; real retirement
  still removes them. A late compositor callback can no longer re-enable the
  Canvas and hide the stable initial poster after Services → Figure3 settles.
- Figure2 reverse media resume rejection now reports a recoverable
  `figure2-reverse-playback-rejected` failure instead of silently advancing a
  frozen frame.
- Figure2 reverse z-depth warmup no longer inherits a stale visible-Canvas
  proof. The Canvas stays gated while the physical `play()` unlock is pending,
  and is exposed only after playback is paused, the media is pinned back to
  2.6 seconds, and a non-seeking endpoint repaint proves the same activation
  generation.
- Figure3 keeps the existing 640×360 poster as the decoded static handoff
  surface. The unconfirmed 1920×1080 poster-only replacement, rebuild source,
  script, hash, and budget increase were withdrawn so the candidate does not
  imply visual parity with the 1280×720 motion encodes.

### 11.2 Fresh automated evidence

| Gate | Result | Fresh evidence |
| --- | --- | --- |
| Vitest | pass | 176 files, 1,319 tests, serialized with one worker, 112.55 s |
| Production build and budgets | pass | typecheck, boolean contract, cutover architecture, module boundaries, packed-alpha masters, Vite, media inventory, release verification, and budgets; phone JS 643,399 B with 20,153 B hard-cap headroom |
| Phone portrait WebKit full suite | pass | 96/96 tests, one worker, 10.9 min |
| Figure3 and Group 4–5 repeat gate | pass | both two-cycle tests repeated three times, 6/6, 3.4 min |
| Complete-story repeat gate | pass | two independent 60-segment runs, 2/2, 5.6 min; the final full suite added another passing run |
| Figure2 reverse endpoint visibility | pass | delayed warmup is hidden until paused endpoint reproves; forward hold, reverse hold, and reverse rejection WebKit cases repeated three times, 9/9, 57.7 s |
| Figure2 reverse rejection | pass | real leaf reports the rejected reverse `play()` and reaches stable rollback or an accessible controlled fault without committing a frozen target |

### 11.3 Blocking visual asset and device evidence

Both shipped Figure3 motion encodes are still 1280×720 (`VP9` WebM and `HEVC`
MP4). Repository-history inspection found no genuine motion master above
1440×810. The retained static poster is 640×360. Canvas DPR and high-quality
smoothing cannot recover source detail, and independently replacing or
upscaling any one derivative would not close the reported blur or visual jump.

To close this gate, provide the genuine Figure3 motion master at no less than
the effective 2× portrait requirement (a 16:9 4K master is sufficient for 2×;
full 3× at a 390×844 viewport requires approximately 4501×2532), regenerate
the first-frame poster and both browser encodes from that same master, update
the frozen media inventory, and repeat the poster-to-Canvas sharpness
comparison on a physical iPhone.

The physical matrix in section 10.4 also remains pending, including low-power
mode, background/foreground recovery, toolbar geometry, touch input, A/B flash,
Figure2 ghosting/arch blur, Figure3 poster-to-Canvas continuity, and viewport
bounce.

### 11.4 Causal scope audit before candidate freeze

The final scope audit contains 45 modified tracked files plus this P0 plan. The
following unrelated or misleading ranges were removed:

- the unconfirmed 1920×1080 Figure3 poster, its source PNG, rebuild command,
  frozen hash, media test, and budget increase;
- direct-entry browser changes that did not establish any of the original P0
  visual paths;
- the Figure3 DPR/smoothing increase, which could not recover source detail.

The retained files map to one of five evidenced contracts: atomic A/B and
shared-foreground presentation; Proof landing/history and rollback recovery;
native Vite preload fail-closed recovery; Figure2 endpoint/warmup behavior; or
Figure3 static proof, replay-safe media lifetime, and two-cycle traversal. Hero
changes are limited to the cold ownership color and a phone-preboot-scoped
Loader rule. No new general runtime, viewport geometry, global gradient, or
unrelated media owner remains in the candidate range.

The complete WebKit gate proved that the initially removed target-media owners
for Services → TTG, Lab → PH, and Education → Crane are compatibility-critical,
not optional expansion. These three receivers have no immutable static poster;
with strict runtime ownership set to `none`, each target could not prove its
first media frame and rolled back. Their incoming legs therefore own target
media preparation while keeping target progress at the authored initial hold.
The focused two-cycle, delayed-chunk, lifecycle, and complete-story failures all
passed after restoring only these three manifest declarations.

The complete WebKit gate also exposed legacy direct-entry helpers that still
waited only for muted autoplay and timed out when the production shell correctly
exposed its covered “继续播放” activation. The existing media, matrix, lifecycle,
and all-hash boot helpers now call the shared `waitForDirectEntryCommit`; no
production behavior changed. The AOD poster test now checks that playback stays
paused at time zero instead of requiring `currentSrc` to be empty despite its
authored `preload="auto"`. All eleven originally failing focused WebKit cases
then passed 11/11 before the complete suite was restarted.

### 11.5 Controlled 60fps visual preflight

Six production-preview WebKit paths were recorded at CFR 60fps and reviewed as
full recordings, 15fps contact sheets, clean checkpoints, and five consecutive
frames centered on each targeted stable handoff. The evidence root is
`app/output/playwright/phone-p0-visual-preflight/`; it is intentionally ignored
from source control and carries its own SHA-256 inventory and report.

| Path | Result |
| --- | --- |
| Cold Hero, Loader, stable Hero, toolbar resize/restore | pass after pre-freeze correction; Loader first pixel is exact `#040807` |
| Hero → Pattern → Star Map → AOD → Method | no early target exposure or empty A/B frame found |
| Figure2 → Proof, reverse, and delayed reverse warmup | no duplicate figure, cross-scope arch, opening-poster leak, or moving z-depth frame found |
| Proof → Brand | no post-commit rebound found |
| Brand → Figure3 → Services → Figure3 → Brand, twice | commit sequence 1→9, no rollback, blank frame, stuck card, or replay/reset jump |

The Figure3 path is a functional/compositor pass only. The reviewed recording
still exposes the expected sharpness/tone difference between the 640×360 poster
and 1280×720 motion derivatives. It therefore supplies no clarity approval and
does not change the blocking status in section 11.3. Physical iPhone Safari
remains the final owner of touch, media-policy, lifecycle, toolbar, and visual
acceptance.

## 12. 2026-08-09 visual-fidelity and back-half handoff addendum

This addendum supersedes the Figure3 normal-poster and combined target-media
ownership descriptions in sections 11.1 and 11.4. It records the implementation
of `2026-08-09-phone-visual-fidelity-and-back-half-handoff.md`; it does not alter
the frozen Task 0 evidence above.

### 12.1 Implemented contracts

- Star Map now derives its dynamic reveal from the existing canonical
  `1672×941` `back2.webp` source. The separate static source and `drawSource:
  false` contract remain, so the map is not double-painted. No media asset was
  added, deleted, upscaled, or re-encoded.
- Figure3 normally decodes the existing motion source at exact frame zero and
  paints that frame through the paper Canvas. Brand → Figure3 holds the paused
  decoded frame; the `640×360` poster is now only a bounded, explicitly reported
  fallback. Mount, stage, Canvas, and poster share the complete phone visual
  viewport height.
- All native reading scenes use one `data-phone-native-mirror` handoff. The
  shell captures document scroll before publishing the edge intent, freezes the
  fixed source copy at that position, and restores the same saved position when
  rollback returns to an unchanged stable commit.
- Choreography now separates `activationOwner` from `mediaClockOwner`.
  Services → TTG, Lab → PH, and Education → Crane may prime target decoders at
  exact paused frame zero without advancing authored media. TTG → Lab,
  PH → Education, and Crane → Contact grant the source the playback clock.
- Presentation proof accepts a registered scene root matching its own content
  or landing selector. This keeps native root-level proof scoped while allowing
  arbitrary mirrored scroll positions.

### 12.2 Fresh automated evidence

| Gate | Result | Fresh evidence |
| --- | --- | --- |
| Vitest | pass | 176 files, 1,326 tests, 41.73 s |
| TypeScript | pass | `pnpm typecheck`, no diagnostics |
| Clean architecture | pass | cutover phase, 10 canonical production files |
| Production build and budgets | pass | artifact tree `77830ca4277817fd0460ce71c6cf05764a09de1afa1f7426ab21a929ff8ebdec`; release manifest SHA-256 `a1145e4d68ad142de118601b9077441c3d06ac0ab4985f0aab38addb1d7bee83`; phone JS 646,551 B with 17,001 B hard-cap headroom |
| Focused historical failures | pass | 10/10 Phone WebKit cases, including Figure3 double-cycle, PH/Crane ownership, native rollback, lifecycle, and delayed/rejected chunks |
| Complete-story stress | pass | two independent 60-segment repetitions, 2/2 in 6.1 min; the final full suite supplied another 60-segment pass |
| Phone portrait WebKit full suite | pass | 67/67, one worker, 9.5 min |
| Source hygiene | pass | `git diff --check`; no new media assets |

One earlier full-suite run completed 66/67: the long complete-story case rolled
Lab → TTG back once after 55 preceding browser tests. The same 60-segment case
then passed twice consecutively, and the exact 67-test suite passed on a fresh
full rerun. The complete-story test now retains a bounded runtime tail on
failure so a recurrence exposes its transaction lineage instead of only the
final rollback scene.

### 12.3 Remaining release gate

The source branch is not yet a frozen candidate commit; the generated manifest
therefore still names the pre-change source commit and must not be used as a
final candidate identity. Both Figure3 motion encodes also remain the existing
`1280×720` assets. The decoded frame-zero path removes the avoidable `640×360`
normal-entry softness and poster-to-Canvas ownership error, but it does not
claim detail beyond the source animation.

Physical iPhone Safari acceptance remains mandatory for normal and Low Power
Mode, expanded/collapsed toolbar, two forward/reverse back-half cycles, touch
input, Star Map and Figure3 sharpness, A/B flash, Figure2 ghosting/arch blur,
and viewport rebound. Until that matrix is recorded against a frozen candidate
commit/build, this implementation is automation-complete but not P0/release
complete.

## 13. 2026-08-10 media-handoff root-cause execution evidence

This section records the execution of
`2026-08-10-001-fix-phone-media-handoff-root-causes-plan.md`. It is candidate
evidence, not physical-device acceptance.

### 13.1 Closed implementation contracts

- Hero now has an explicit stable-idle start signal. The visible entrance can
  finish without fabricating segment progress, and the Figure1 media clock
  advances only after Hero is stable.
- AOD switches its packed-alpha surface to `forward` before formal playback,
  validates the current Canvas frame before hiding the poster, and hides the
  confirmed StoryNav owner through the shell scene policy rather than a local
  overlay.
- The retained Figure2 arch is hidden while a target receiver prepares and is
  admitted with the target transition boundary; direct/stable Figure2 entry
  keeps the arch visible.
- Brand → Figure3 grants target activation without granting a media clock.
  The same video is primed and proved at frame zero when available; the
  existing poster is only a bounded initial-composite fallback. Figure3 →
  Services remains the sole Figure3 playback segment.

### 13.2 Fresh automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Vitest | pass | 177 files, 1,347 tests |
| TypeScript | pass | `pnpm typecheck`, no diagnostics |
| Focused production-leaf probes | pass | Hero stable idle, AOD visible playback/chrome, Figure2 arch admission, Figure3 activation/fallback |
| Phone portrait WebKit full suite | pass | 69/69, one worker |
| Source hygiene | pass | `git diff --check` |

The full WebKit suite also includes the complete 60-segment traversal, real
media-time assertions for Hero/AOD/Figure2/PH/Crane, atomic exposed-buffer
checks, and the bounded Figure3 poster-fallback case. A single long-suite
Crane direct-entry timeout was reproduced as a timing flake and passed on the
immediate isolated rerun; the fresh complete suite then passed 69/69.

### 13.3 Remaining release gate

The candidate commit/build identity must be used for iPhone testing; a dirty
workspace or pre-freeze build is not an acceptance artifact. Physical iPhone
Safari remains mandatory for touch input, normal and Low Power Mode, toolbar
changes, background/foreground, AOD → Method, Figure2 arch continuity,
Brand ↔ Figure3, Figure3 sharpness within the existing 1280×720 source limit,
A/B flash, ghosting, and viewport rebound. Until that matrix is recorded,
these automated results do not close the physical P0.

## 14. 2026-08-10 delayed Figure3 fallback and Hero lifecycle follow-up

This addendum records the two final correctness-review fixes applied after
section 13. It remains automation evidence only; the physical iPhone gate is
unchanged.

### 14.1 Closed review findings

- Figure3 initial activation now races the decoded frame preparation against
  the already decoded poster proof. A poster winner settles the activation
  immediately even when frame preparation never resolves; synchronous prime
  errors and asynchronous preparation failures enter the same bounded fallback
  path. A late frame can still upgrade the current generation while the
  presentation remains owned by that generation.
- Completed Hero entrance state is retained across lifecycle pause. A stable
  `settle(0)` after visibility/BFCache recovery reactivates the compositor and
  stable-idle Figure1 clock without replaying the Loader entrance or fabricating
  segment progress.

### 14.2 Fresh automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused regression units | pass | 21/21 Figure3 and Hero tests |
| Vitest | pass | 177 files, 1,350 tests |
| TypeScript | pass | `pnpm typecheck`, no diagnostics |
| Production build and budgets | pass | phone JS 658,775 B; hard-cap headroom 4,777 B |
| Targeted phone WebKit | pass | 6/6, including Hero lifecycle recovery and Figure3 atomic handoff |
| Phone portrait WebKit full suite | pass | 70/70, one worker, 9.3 min |
| Source hygiene | pass | `git diff --check` |

The full suite includes the new visibility/BFCache Hero recovery traversal and
the existing withheld-frame, poster-fallback, atomic-buffer, and complete
60-segment checks. A candidate commit, release manifest, and build identity
were then frozen for candidate v22:

- commit: `50624bbb2fac569bc915d60f189133e6e0a8b71e`
- annotated tag: `react-refactor-r5-parity-repair-candidate-v22`
- tag object: `c5a78a1e998e409ed0ecb09b55c1d6d6ebbffddc`
- artifact tree: `048ba28956369f1d966ee4e6873a18d8e356699fc828b8a09b7fbc44671b4ad8`
- release manifest: `8d41e167a241f081705243e46c0221e93fe25e9c5e153ac6f75dfd4d9f5755cc`
- `sourceDirty`: `false`

The later in-flight-entrance review finding supersedes v22 for final physical
acceptance. The current follow-up is the source change for the newer immutable
candidate; no dirty build is a physical acceptance artifact.

### 14.3 Remaining release gate

Physical iPhone Safari remains mandatory for touch input, normal and Low Power
Mode, toolbar changes, background/foreground, AOD → Method, Figure2 arch
continuity, Brand ↔ Figure3, Figure3 sharpness within the existing 1280×720
source limit, A/B flash, ghosting, and viewport rebound. Until that matrix is
recorded against the immutable candidate commit/build, the implementation is
automation-complete but not P0/release complete.

## 15. 2026-08-10 in-flight Hero entrance lifecycle follow-up

This addendum closes the remaining Hero lifecycle review gap discovered after
candidate v22.

### 15.1 Closed review finding

- Hero now tracks `idle`, `running`, and `completed` entrance states. Lifecycle
  pause cancels only the scheduled animation frame while retaining `running`.
  Recovery that lands on a running Hero completes that already-started entrance
  and restores stable-idle Figure1 playback; it does not replay Loader.

### 15.2 Fresh automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused Hero unit tests | pass | 10/10, including interrupted entrance recovery |
| Vitest | pass | 177 files, 1,351 tests |
| TypeScript and production build | pass | phone JS 658,916 B; hard-cap headroom 4,636 B |
| Focused phone WebKit | pass | interrupted entrance recovery, 1/1 |
| Phone portrait WebKit full suite | pass | 71/71, one worker, 9.4 min |
| Source hygiene | pass | `git diff --check` |

The next candidate commit contains this follow-up and must be the only source
used for physical acceptance. The generated release manifest is the authority
for its immutable commit, tag, artifact tree, and `sourceDirty` identity.

### 15.3 Remaining release gate

Physical iPhone Safari remains mandatory for normal and Low Power Mode,
toolbar changes, background/foreground during and after Hero entrance, touch
input, AOD → Method, Figure2 arch continuity, Brand ↔ Figure3, Figure3
sharpness within the existing 1280×720 source limit, A/B flash, ghosting, and
viewport rebound. Until that matrix is recorded, the implementation is
automation-complete but not P0/release complete.
