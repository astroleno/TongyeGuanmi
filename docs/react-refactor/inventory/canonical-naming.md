# Canonical Naming Inventory

R-1 conclusion: keep `ARCHITECTURE.md` section 3.1 as the canonical story spine. R5 subsequently froze D1–D3: all animation scenes remain semantic holds, Proof becomes one `figure2-proof` reading hold, and transitions remain runtime edges rather than presentation owners.

## Evidence Base

| Evidence | Role |
|---|---|
| `src/section-manifest.mjs` | Legacy coarse section order, transition ids, handoff ids, entry policies |
| `src/index.template.html` | Source transition host placement before build metadata injection |
| `index.html` | Current build output: generated `data-section-*`, `data-transition-*`, hash anchors |
| `src/sections/*.html` | Canonical copy source and legacy section DOM |
| `js/transitions/homepage-transition-registry.js` | Registry key to adapter module mapping |
| `js/transitions/homepage-transition-runtime.js` | Runtime interpretation of playMs, stageStops, stageHoldVh, postScrollVh, direct hash behavior |
| `js/transitions/homepage/*.js` and `js/transitions/pattern-bloom-adapter.js` | Adapter ownership, assets, handoff receiver ranges |

## Canonical Scene Ids

These are the only scene ids R0 may use unless a later HITL-confirmed ADR changes the spine:

```txt
hero
pattern
star-map
aod-animation
method-top
figure2-animation
figure2-proof
brand
figure3-animation
services
ttg-animation
lab
ph-animation
education
crane-animation
contact
```

`figure2-distance-expand` remains a `SegmentId`, not a `SceneId`. `figure2-proof-opening`, `figure2-proof-cards`, and `figure2-proof-closing` are redirect aliases and internal panel anchors only; they are not canonical SceneIds.

## Legacy Section Mapping

| Legacy section/hash | Canonical mapping | Evidence | Notes |
|---|---|---|---|
| `#home` / `src/sections/hero.html` | `hero` | `index.html#home`, hero title/subtitle and media before module script | The hero scene owns first viewport copy and base media. |
| `#belief` / `src/sections/belief.html` | `pattern`, `star-map` | `canvas.belief-star-field`, `home-belief` pattern-bloom adapter | Legacy `belief` is not a canonical name; split visual renderer identity into `pattern` and `star-map`. |
| `#method` first screen | `method-top` | `.method-edition-layout--after-handoff`, `data-scene-id="method-field-law"` | Old `method-field-law` is renamed away. |
| `#method` process list | `method-top` internal reading content | `data-scene-id="method-cocreation"`, `data-scene-id="method-tooling"`, single 01-05 list | Old cocreation/tooling anchors are not canonical scenes. |
| `.method-proof` | `figure2-proof` with opening/cards/closing panels | `data-scene-id="method-proof" data-transition-source-only="true"` | One canonical article and scrollport own all three copy roles. |
| `#brand` | `brand` | `.brand-definition-grid`; figure2 handoff target selector | Native DOM is adopted during handoff; copy source remains `src/sections/brand.html`. |
| `#services` | `services` | `src/sections/services.html`, nav hash `#services` | Figure3 adapter is visual-only; Services copy stays native. |
| `#lab` | `lab` | `src/sections/lab.html` | Old label "scenario" becomes canonical `lab`. |
| `#education` | `education` | `src/sections/education.html` | Native hold after `ph-animation`. |
| `#philosophy` | no canonical scene | `src/sections/philosophy.html`, `education-philosophy` soft-breath | Legacy-only duplicate brand concept copy. Keep in copy baseline for explicit retirement/merge. |
| `#contact` | `contact` | `src/sections/contact.html`, crane handoff target `.contact-endpoint` | Native DOM is adopted during handoff. |

## Legacy Transition Mapping

| Legacy id | Canonical expansion | Adapter/module | Policy seed | Evidence status |
|---|---|---|---|---|
| `home-belief` | `hero -> hero-pattern -> pattern -> pattern-star-map -> star-map` | `pattern-bloom` | `data-transition-drive="scroll"`; adapter ranges `0..0.46`, `0.42..0.70`, `0.58..0.985` | DOM/build/adapter aligned |
| `belief-method` | `star-map -> star-map-aod -> aod-animation -> aod-method-top -> method-top` | `aod` | `data-transition-play-ms="2600"`; `handoffPhase=after-playback`; receiver `.method-edition-layout--after-handoff` | DOM/build/adapter aligned |
| `method` reading | `method-top` | no transition adapter | Native reading/scroll section; old anchors `method-field-law`, `method-cocreation`, `method-tooling` | R5 canonicalized as one reading hold |
| `method-tooling__method-proof` + handoff `method-proof-brand` | `method-top -> method-bottom-figure2 -> figure2-animation -> figure2-distance-expand -> figure2-proof -> figure2-proof-brand -> brand` | `figure2` | `stageStops=[0.72]`, `stagePlayMs=[2600,1500]`; Proof panels use one `300svh` scrollport | D2 frozen; three old Proof IDs are aliases only |
| `method-brand` | covered by `figure2-proof-brand` | `soft-divider` | Legacy divider; continuity CSS collapses it in homepage path | Retire in R0 manifest |
| `brand-services` | `brand -> brand-figure3 -> figure3-animation -> figure3-services -> services` | `figure3-transition` | `stageStops=[0.997]`, `stagePlayMs=[2000,620]`; adapter has no Services copy | DOM/build/adapter aligned |
| `services-lab` | `services -> services-ttg -> ttg-animation -> ttg-lab -> lab` | `ttg` | runtime `MODULE_PLAY_MS.ttg=2500`; adapter `data-ttg-duration=2.5` | DOM/build/adapter aligned |
| `lab-education` | `lab -> lab-ph -> ph-animation -> ph-education -> education` | `ph` | runtime `MODULE_PLAY_MS.ph=1520`; single PH alpha video | DOM/build/adapter aligned |
| `education-philosophy` | retired legacy soft join | `soft-breath` | No executable adapter; target section not canonical | No spine correction; explicit R0 retirement |
| `philosophy-contact` | `education -> education-crane -> crane-animation -> crane-contact -> contact` | `crane` | `handoffPhase=after-playback`; receiver `.contact-endpoint`; old `from=philosophy` ignored for canonical order | DOM/build/adapter aligned with planned retirement of philosophy |

## Names To Retire

Do not introduce these names into R0 `story/manifest.ts` except as inventory comments/test fixture labels:

```txt
home
belief
method-field-law
method-cocreation
method-tooling
method-proof
method-brand
method-tooling__method-proof
method-proof-brand
scenario
philosophy
education-philosophy
philosophy-contact
```

## Correction ADR Check

No `docs/react-refactor/decisions/canonical-spine-correction.md` was created in R-1.

Facts that look different from the canonical spine but do not require correction:

| Fact | Why no correction |
|---|---|
| Legacy build output has `#philosophy` between `#education` and `#contact`. | `philosophy` repeats brand concept copy and has only a `soft-breath` join; architecture already maps the crane path into `education -> crane-animation -> contact`. |
| Legacy build output has `method-brand` after `.method-proof`. | The actual Figure2 post-scroll handoff is `method-tooling__method-proof` with handoff id `method-proof-brand`; `method-brand` is a collapsed soft divider. |
| Legacy `.method-proof` has one DOM block. | R5 keeps that ownership model: one canonical `figure2-proof` article owns three internal viewport panels; no three-scene split remains. |
