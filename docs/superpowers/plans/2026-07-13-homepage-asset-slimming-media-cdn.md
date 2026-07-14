# Homepage Asset Slimming and Media CDN Plan

**Date:** 2026-07-13

**Asset source base:** `d4cab484e8f2d8656cf7c7cd0e19c015c7332702`

**Batch A v1 asset commit:** `7ea69d5864eb91b2aaf5ef424229d14ba2c40ec6`

**Batch A final integration input:** `3f16dd0b3f136e699cb3cbd88c1241b4875d9393`

**Integration base:** `3b3ce381560be1cd92f043925cc4ec4120b5fcbb`

**Source asset tree:** `43c33a2ccb944d2db1edfc9ce3d41c5fc6ea2e95` (`9a602e9f` and `d4cab48` have the same `assets` tree)

**Scope:** asset slimming first, minimal playback wiring second, Tencent Cloud CDN as an independent rollout

**Status:** Batch A/A.1 and the three Batch B implementation commits exist locally; production release and CDN rollout remain unapproved

**Batch B commits:** `c273726` (derivatives), `f5a4979` (runtime wiring), `be119da` (source removal)

The DNS/TLS path has only been mock-validated. That evidence does not satisfy CDN rollout acceptance, does not mean certificate automation is deployed, and does not authorize switching application asset URLs.

## 1. Locked decisions

- Hero keeps the existing `assets/figure1.webm`, existing `assets/figure-poster.jpg`, and authored `0.34–2.34s` interval. Batch B must not crop, re-encode, replace, or delete either Hero media file.
- Hero → Pattern remains a 2200ms snap whose segment timeline seeks the existing Hero interval in both directions. It is not user-driven scroll scrubbing.
- Every non-Hero animation completes automatically after one accepted scroll intent.
- Downward navigation prepares the exact first frame and then uses `native-preferred` forward playback. Upward navigation prepares the exact terminal frame and automatically runs timeline-driven descending seeks; the user does not keep scrolling.
- Each non-Hero animation uses one physical video file in both directions. `native-preferred` and descending seeks are two control paths over the same bytes, not two asset groups. Dedicated reverse files are removed.
- Normalize adopted non-Hero files to their authored runtime windows before integration: Figure2 left/right, AOD, and Figure3 use 2.6s; PH uses 1.52s; TTG and both Crane clips remain 2.5s. Hero remains unchanged.
- All eight canonical non-Hero files use a 30fps delivery cadence. A 2.6s file therefore has 78 presented frames and a 2.5s file has 75. Do not relabel, duplicate frames, or interpolate a 24fps final file merely to report 30fps; a longer source may be progress-resampled to 30fps only when it contains enough distinct authored frames for the shorter target window.
- 60fps is not a default output and no parallel 30/60 variants are produced. It requires separate user approval for one named clip, an authentic 60fps source, and measured evidence that the 30fps candidate misses the motion-cadence gate.
- Only the existing Hero poster remains. Non-Hero posters and redundant terminal-frame images are removed.
- Figure2 far arch is baked into one WebP. Pixel-exact reproduction of the former three-pass blend is not required; the accepted target is one visually coherent arch asset.
- Do not introduce a shared paper bitmap. Pattern and Crane keep separately optimized backgrounds; AOD and Figure3 keep their CSS paper surfaces; PH keeps its compositional seascape.
- CDN origin is Tencent Cloud COS Shanghai region `ap-shanghai`, fronted by Tencent Cloud CDN.
- Images, fonts, and the Hero poster use `https://assets.tongye.me`; WebM videos use `https://media.tongye.me`.
- `assets.tongye.me.cdn.dnsv1.com` and `media.tongye.me.cdn.dnsv1.com` are DNS CNAME targets only and must not appear in application asset URLs.
- `d4cab48` is the recorded Batch A source commit. Its asset tree is byte-identical to the earlier `9a602e9f` inventory point; neither commit is the visual-parity baseline.
- Runtime integration starts from the frozen, code-verified `3b3ce381` visual-fix baseline. Batch B must record it as `INTEGRATION_BASE_SHA` before changing imports or playback.

This is not a Director or scene-architecture refactor. Keep the existing segment ownership and change only approved asset imports, video preparation/playback wiring, and the tests directly affected by those changes. Batch A candidates must be validated against `INTEGRATION_BASE_SHA` before deletion or release. The generated `hero-figure-scrub.webm` and `hero-figure-scrub-poster.webp` are explicitly unadopted candidates and must not enter the Batch B integration history, runtime, build output, or deletion plan.

## 2. Verified R5 starting point

- At `3b3ce381`, R5 imports 12 animation files. The target is nine: the unchanged `figure1.webm` Hero plus eight canonical non-Hero videos.
- Figure2 currently renders four video elements: two forward files and two long reverse files.
- TTG currently renders separate forward/reverse videos plus a terminal-frame PNG.
- AOD, PH, Figure3, and Crane currently use timeline seeks in both directions. Batch B changes only their forward runs to prepare-first `native-preferred`; reverse remains timeline-driven.
- Batch A v1 compressed the codecs and images but did not normalize several clips to their runtime windows: Figure2 is 5.0s, PH 2.533s, AOD 5.033s, and Figure3 5.042s. Batch A.1 corrects those durations before runtime integration rather than making the browser decode them at 1.7–2.5× speed.
- Hero already uses segment-timeline seeks in both directions and no longer starts playback merely because it becomes visible. Batch B preserves that behavior and its existing media source.
- Five non-Hero posters plus `ttg_figure-terminal.png` occupy about 4.12 MiB.
- TTG's whole-segment RGB SSIM after temporal reversal is approximately `0.9945`. This is diagnostic evidence only; it does not prove endpoint continuity, direction-change continuity, or alpha-composited parity and cannot release TTG by itself.

## 3. Playback and keyframe contract

Every frame does not need to be a keyframe.

### Hero ownership — behavior preserved, media unchanged

1. During loading, keep the Hero video paused at its authored initial frame.
2. After loading, automatically run the approximately 2.7-second Hero layer, text, and ink-drop intro. The video remains paused at the authored initial frame throughout this intro.
3. Only after the intro settles may the accepted Hero → Pattern snap map its 2200ms segment-timeline progress to the existing `0.34–2.34s` authored interval through `currentTime`.
4. When returning to Hero, reverse the same segment timeline and seek backward through the same interval.
5. `hidden=false` must never start Hero video playback by itself.

`StoryApp`/Hero intro state owns the loading-to-intro sequence. The Hero → Pattern segment timeline owns video time only after intro completion. These two owners must not write video time concurrently.

Do not trim or re-encode Hero. Keep `figure1.webm`, `figure-poster.jpg`, the existing interval constants, and the current timeline preparation/cancellation behavior. The only permitted Hero media-loading change in Batch B is preventing the existing full WebM from transferring before the first accepted Hero → Pattern intent when required by the frozen 4 MiB transfer gate.

### Non-Hero playback

- Forward: prepare and present the exact first frame, reveal the element, then use muted `native-preferred` playback. A rejected or stalled native start may use the existing driver fallback; do not build another fallback path.
- Reverse: prepare the last frame, then let the existing transition timeline issue descending `currentTime` targets automatically. The user does not need to keep scrolling.
- Encoding: VP9 alpha WebM at 30fps with a maximum GOP duration around 250 ms (`g=7` or `8`).
- If one specific clip misses the frozen reverse-frame cadence target, make one fallback encode of that clip as all-intra. Do not start an open-ended sequence of new encoding versions.

Here, “timeline-driven reverse” means **automatic reverse seek playback after one accepted intent**. It is not scroll scrubbing, it does not require a second video, and it does not change the authored animation: the same physical WebM is traversed from its final presented frame back to its first. The separate low-level path exists only because target browsers do not provide reliable negative-rate native playback for these WebM assets.

The normalized file should play forward at approximately 1×. Do not retain a 5s file and depend on 1.9–2.5× `playbackRate` to fit a 2.6s segment. Reverse automatically traverses the same normalized file from its last presented frame to its first; only the browser-control mechanism differs.

Temporal normalization is a one-time offline Batch A.1 operation. Production does not crop, regenerate, or re-encode media per transition: forward playback presents the whole canonical file at approximately 1×, while only endpoint preparation and the same-file automatic reverse path write `currentTime`. This is the runtime-load reduction being accepted; it does not claim that reverse seeking disappears.

Do not use `video.playbackRate = -1` as the release path. Negative media playback rate is still not broadly supported across target browsers. The R5 descending-time driver is already present and keeps this change local.

Direction replacement must continue from the last presented frame without flashing a poster, jumping to an endpoint, or accepting stale frame callbacks from the previous run.

Forward activation windows remain scene-specific:

- AOD: play the full canonical clip across the 2600ms AOD → Method transition.
- PH: play across the 1520ms media leg; the following 600ms remains the existing dissolve leg.
- Figure3: play across the user-approved 2600ms Figure3 → Services segment while CSS scale/fill/copy continue to follow the same 2600ms segment timeline. Batch B updates `FIGURE3_SERVICES_DURATION_MS` from 2000 to 2600.
- Crane flock: start at segment time 0 and finish at 2.5s.
- Crane figure: hold its prepared first frame until segment time 0.5s, then play for 2.5s and finish at the 3.0s segment endpoint. Do not start both Crane videos at segment time 0.

### TTG and Figure2 continuity gate

Whole-segment SSIM is not an acceptance gate. Compare the final alpha-composited browser output against `INTEGRATION_BASE_SHA` at each of these points:

1. forward initial frame versus the current static hold;
2. forward terminal frame;
3. reverse start versus the forward terminal frame;
4. reverse terminal frame versus the forward initial frame;
5. a mid-play direction change from the last presented frame;
6. the same checks over the real scene background/CSS stack, including alpha edges, not RGB video frames alone.

Any one-frame flash, endpoint jump, alpha fringe, or direction-change discontinuity blocks deletion of the old TTG/Figure2 media.

## 4. Asset outputs

### Images

| Input group | Production output |
|---|---|
| Hero background and middle mountain | `hero-back.webp`, `hero-middle.webp` |
| Figure2 white/color/arch-mask far layers | `figure2-far-arch.webp` |
| Figure2 merged middle building | `figure2-middle-building.webp` |
| Figure2 cloud and near arch | separate WebPs |
| TTG background/middle/foreground groups | three WebPs |
| Pattern 4K mottled background | `pattern-background.webp` |
| Crane `aod-paper-bg.png` | `crane-paper.webp` |
| AOD and Figure3 paper surfaces | no image output; retain CSS colors/gradients |

Rules:

- Bake the Figure2 far arch's three current visual passes into one WebP and remove the production-layer fallback. Judge it by the final scene appearance, not mathematical equivalence to the old blend stack.
- Convert Hero `back1.png` and `middle1.png` to the two listed WebPs so the frozen 4 MiB pre-scroll target is achievable.
- Keep `figure2-middle-depth.png` and Hero `middle1_depth.png` lossless and pixel-exact.
- Keep the generated Figure2 inverse-alpha window mask in the first pass; eliminating it is not required for this task.
- Remove the fully transparent `ttg_front-alpha.png`.
- Pattern keeps its five alpha layers and uses its own compressed mottled WebP.
- Crane uses its own optimized paper WebP; AOD and Figure3 continue using CSS paper surfaces.
- PH keeps `ph_background.png` because it contains the seascape, island, sun, and moon.

### Videos

#### Authoritative source lineage

The generation input is not automatically the newest or largest WebM. Freeze the exact lineage below before Batch A.1 and distinguish a direct encode master from a visual-only reference.

| Canonical output | Authoritative source and immutable identity | Use in Batch A.1 |
|---|---|---|
| Figure2 left/right | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha-scrub.webm` and `...:assets/figure2b-alpha-scrub.webm`; each is 600×1066, 120 frames, 5.0s, 24fps with alpha | Direct encode masters. Map the 120 authored frames over normalized progress to 78 distinct output frames. Do not use `*-alpha-auto`, a dedicated reverse file, or a Batch A v1 output as input. |
| PH | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ph_figure-alpha-scrub.webm`; 1672×942, 76 frames, 2.533s, 30fps; Dreamina ProduceID `v0d870g10004d8qn64iljht2955di6o0`, origin item `7653149568284118281` | Direct encode master for the 46-frame target. The older `f57de9f` PH generation has a different ProduceID and is not the accepted source. |
| TTG | Current visual/alpha authority: `5f53013fe1a26d12df4fbd1c48d2a0f84ce8047d:assets/ttg_figure-alpha-scrub.webm`; 720×1280, 60 frames, 2.5s, 24fps. Its high-frame-rate generation source is not present in repository history and its provenance tags were stripped. | Visual reference only. Reacquire the exact source project/export that produced the `5f53013` refresh and freeze a durable path or source ID with at least 75 distinct authored frames. The older `ff04961a094c31504ff557ea6d00ddf016dcee74:assets/ttg_figure-alpha-scrub.webm` 4.017s/60fps asset (ProduceID `v0d870g10004d8pbsv2ljhteudth6j00`) is not authorized as the source because it does not establish parity with the refreshed asset. Missing refreshed-source identity blocks TTG regeneration. |
| Crane figure | Motion root: `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure1.mp4`; 3184×1792, 300 frames, approximately 60fps; Dreamina ProduceID `v0d870g10004d8ooqp2ljhtblqvrqmg0`, origin item `7652052558382435593`. Current alpha/endpoint authority remains `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure1-transition.webm`. | Rebuild the 75-frame alpha clip from the motion root while matching the current transition's matte, crop, first frame, and terminal frame. Do not upsample the current 60-frame/24fps WebM. |
| Crane flock | Source lineage: Dreamina ProduceID `v02870g10004d8p28hqljhtcnj8e648g`, origin item `7652218180131163401`; repository verification copy `ac46a868e13ca286ea3a6cdfad71c5b6e0ca37b1:assets/crane-figure2-transition.webm` is 1280×720, 74 frames, 2.466s, 30fps. Current endpoint authority is `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure2-transition.webm`. | Re-export from the identified Dreamina source at 30fps to obtain the complete 75-frame 2.5s window, then match the current matte/endpoints. Do not manufacture the missing frame by generic duplication or optical-flow interpolation. |
| AOD | Direct alpha master: `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod_figure-alpha-front-scrub.webm`; 1672×941, 151 frames, 5.033s, 30fps. Lineage root: `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod_figure.mp4`, 300 frames at approximately 60fps; Dreamina ProduceID `v0d870g10004d8p8fraljht0v17t69b0`, origin item `7652328060460518666`. | Use the alpha master directly for the 78-frame normalized output. The RGB motion root is provenance/repair evidence only unless the accepted front matte can be reproduced exactly. |
| Figure3 | `262b17b8c07f2921d91b308d89586e2f7fd6c00a:assets/figure3-alpha-scrub.webm`; 1440×810, 121 frames, 5.042s, 24fps; Dreamina ProduceID `v02870g10004d8nvbqaljhtarb7f070g`, origin item `7651603576271146267` | Direct high-resolution encode master for 78 distinct target frames. It is the same source identity as the later 1280×720 derivative; a scale-normalized RGB diagnostic measured SSIM 0.993595. |

The current TTG refresh-source gap is the only unresolved source-identity blocker. Batch A.1 may inventory and encode the other clips, but it must not finalize its single commit or declare `BATCH_A_FINAL_SHA` until TTG's exact refreshed source is recorded. Do not search unrelated personal folders or shell history; source reacquisition must come from the named project/export or an explicit user-provided location.

Production targets:

| Production file | Target playback window | FPS | Target frames | Batch A.1 action |
|---|---:|---:|---:|---|
| existing `figure1.webm` | existing authored `0.34–2.34s` interval | existing | existing | retain byte-for-byte |
| `figure2-left-motion.webm` | 2.6s | 30 | 78 | progress-resample the recorded Figure2 left master |
| `figure2-right-motion.webm` | 2.6s | 30 | 78 | progress-resample the recorded Figure2 right master |
| `ph-figure-motion.webm` | 1.52s media leg | 30 | 46 | progress-resample the accepted PH master and record its actual final PTS/container duration |
| `ttg-figure-motion.webm` | 2.5s | 30 | 75 | re-export from the reacquired refreshed TTG source; blocked until that source is frozen |
| `crane-figure-motion.webm` | 2.5s | 30 | 75 | rebuild from the recorded motion root; runtime starts it at segment time 0.5s |
| `crane-flock-motion.webm` | 2.5s | 30 | 75 | re-export from the identified Dreamina source; runtime starts it at segment time 0 |
| `aod-figure-motion.webm` | 2.6s | 30 | 78 | progress-resample the accepted AOD alpha master |
| `figure3-motion.webm` | 2.6s | 30 | 78 | progress-resample the recorded high-resolution Figure3 master |

Batch A also generated `hero-figure-scrub.webm`, but no Hero replacement was authorized. It is not a production target and must be excluded when Batch A changes are applied to the integration branch.

Batch A rebuilt Figure2's canonical pair from the source archive recorded in the deletion record rather than reusing the one-keyframe `*-alpha-auto.webm` files. Batch A.1 re-times those same high-quality sources to 2.6s; it must not transcode the already compressed v1 candidate. Batch B then validates the normalized pair against both current forward and reverse endpoints.

For every adopted non-Hero video, record only the information needed to reproduce and verify it: immutable source ref/path or external source ID, FFmpeg command, source/output bytes, target and actual container duration, source/output frame counts, dimensions, frame rate, alpha presence, GOP/keyframe count, first/last presented-frame PTS, and first/last-frame comparison. Runtime `startSeconds`/`endSeconds` must use those presented-frame timestamps rather than old-file duration fallbacks. At 30fps, the 2.6s and 2.5s targets are exactly 78 and 75 frames. PH's 1.52s media leg is not an integer number of 30fps frame intervals, so its 46-frame candidate must record its real final PTS and container duration rather than inventing an exact timestamp. Hero retains its existing source and authored interval.

### Deletion record

Before deleting any source, dedicated reverse video, poster, or terminal image, create `docs/assets/homepage-asset-slimming-report.md` with no `TBD` fields. It must record:

- the actual source archive root as an absolute filesystem path or durable object-storage URI;
- each original repository path and its exact archive path;
- source SHA-256;
- the exact image/FFmpeg generation command and resulting production path;
- a restore drill that restores every scheduled deletion into a temporary directory and confirms all SHA-256 values;
- restore-drill date and pass/fail result.

Missing archive location, checksum, command, or successful restore result blocks deletion.

Before Batch B deletes anything, amend the Batch A report so that:

- `assets/figure1.webm` and `assets/figure-poster.jpg` are marked **retained**, not scheduled for deletion;
- `assets/hero-figure-scrub.webm` and `assets/hero-figure-scrub-poster.webp` are marked **unadopted Batch A outputs**;
- the final runtime byte totals exclude both unadopted Hero candidates and include the retained Hero video/poster.

### Posters and terminal frames

Keep the existing `assets/figure-poster.jpg`. Do not replace it with the generated Batch A Hero poster.

Remove:

- `figure2a-alpha-reverse-lite-poster.png`
- `figure2b-alpha-reverse-lite-poster.png`
- `figure3-alpha-poster.png`
- `ph_figure-alpha-poster.png`
- `ttg_figure-alpha-scrub-poster.png`
- `ttg_figure-terminal.png`

Reuse R5's existing presented-frame preparation (`prepareTimelineVideoFrame`, `requestVideoFrameCallback`, run cancellation, and Director recovery). Do not build another poster or media-gate subsystem.

Required fallback after non-Hero poster removal:

- cold cache: keep the source scene or target's non-video composition visible and keep the video transparent until the requested frame is presented;
- direct hash entry: render the target background/layers/copy immediately, keep its video transparent, and reveal it only after the required hold frame is presented;
- reduced motion: settle directly to the requested endpoint frame; if decoding fails, keep the non-video static composition;
- decode error or preparation timeout: never expose a black video rectangle and never reference a deleted poster; keep the video hidden, mark the scene as a static-media fallback, and let existing local Director recovery settle the transition.

The defined failure visual is therefore the scene's non-video background/layers/copy with the missing animated figure hidden.

## 5. Minimal runtime changes

- Hero: keep `figure1.webm`, `figure-poster.jpg`, `0.34–2.34s`, and the current bidirectional timeline-seek owner. If the frozen pre-scroll transfer gate requires it, change only the existing video preload policy so the full WebM does not transfer during loading/intro.
- Figure2: replace two directional video pairs with two canonical video elements. Use prepare-first `native-preferred` forward playback and timeline-driven reverse playback. Remove the now-unnecessary poster blend, forward/reverse surface switching, and terminal bridge canvases after continuity passes.
- TTG: replace forward/reverse/start/terminal surfaces with one canonical video element. Use prepare-first `native-preferred` forward playback and timeline-driven reverse playback.
- AOD, PH, Figure3, and both Crane videos: use prepare-first `native-preferred` forward playback and timeline-driven reverse playback through the existing driver. Preserve the scene-specific activation windows above.
- Figure3 timing: update `FIGURE3_SERVICES_DURATION_MS` and its manifest/test expectations from 2000ms to the user-approved 2600ms. No other scene duration changes are authorized by Batch B.
- Manifest: replace only the existing non-Hero media keys with the eight canonical non-Hero keys. Do not add a new Hero media contract.
- Remove `directional-media-controller` if Figure2 and TTG are its final consumers after migration.
- Remove non-Hero `poster` attributes/imports only after their requested start/terminal frames are prepared before reveal.

Do not add a new state machine, runtime manifest service, generalized media framework, or Director state.

The eight canonical non-Hero media keys are `figure2-left-motion`, `figure2-right-motion`, `ph-figure-motion`, `ttg-figure-motion`, `crane-figure-motion`, `crane-flock-motion`, `aod-figure-motion`, and `figure3-motion`.

## 6. Fast, stable execution order

### Batch A v1 — Completed compression input

Batch A v1 is complete at `7ea69d5864eb91b2aaf5ef424229d14ba2c40ec6`, generated from `d4cab484e8f2d8656cf7c7cd0e19c015c7332702`. Its report records the generation commands, checksums, preliminary endpoint comparisons, and a passing 37/37 restore drill.

Batch A v1 produced twelve WebPs and nine WebMs. It completed codec/image compression but left Figure2, PH, AOD, and Figure3 longer than their authored runtime windows, and it retained 24fps outputs for Figure2, TTG, both Crane clips, and Figure3. Batch B adopts eleven image derivatives and eight non-Hero WebMs only after Batch A.1 replaces every non-Hero candidate with the approved 30fps canonical output. `hero-figure-scrub.webm` and `hero-figure-scrub-poster.webp` remain unadopted experiments because Hero media replacement is outside the approved scope.

### Batch A.1 — One bounded temporal-normalization iteration

Complete this asset-only correction before Batch B:

1. Continue from the Batch A v1 generation worktree/branch. Do not touch application code, CSS, runtime manifests, or the R5 integration branch.
2. Freeze the authoritative lineage table above. Re-encode only from its direct masters; never from a lossy Batch A v1 WebM. Reacquire and record the exact refreshed TTG source before producing or accepting a TTG candidate.
3. Replace the same canonical output filenames at 30fps: Figure2 left/right, AOD, and Figure3 are 2.6s/78 frames; TTG and both Crane clips are 2.5s/75 frames; PH covers its 1.52s media leg with 46 frames and records the actual final PTS/container duration.
4. Preserve the authored first and final visible states, VP9 alpha, and the short-GOP contract. Progress resampling may discard surplus source frames when shortening a clip, but it must not crop away either endpoint, duplicate frames solely to satisfy 30fps, or use generic optical-flow interpolation.
5. Rebuild TTG and both Crane candidates from their recorded source lineage; they are no longer byte-identical to Batch A v1. Leave Hero source/poster untouched and keep the two generated Hero candidates unadopted.
6. Prove output cadence with `ffprobe -count_frames` and a frame-identity report. Each 2.6s output must expose 78 frames and each 2.5s output 75; any intentionally repeated terminal hold must be authored and documented rather than an encoder-generated cadence filler.
7. Update `docs/assets/homepage-asset-slimming-report.md` with each normalized source identity, command, target/actual duration, source/output frame counts, first/last PTS, alpha/keyframe checks, output bytes, SHA-256, and corrected totals. Correct the report's Hero deletion rows to retained/unadopted before finalization.
8. Run the existing endpoint diagnostics and restore drill, commit once as `perf(assets): normalize homepage motion durations`, and record that immutable descendant SHA as `BATCH_A_FINAL_SHA`.

Batch A.1 stops after this one correction commit. A failed alpha check, missing endpoint, or missed cadence/size gate permits at most the already defined single all-intra fallback for the affected clip; it does not authorize more version churn. Missing TTG source provenance is not an encoding failure and cannot be bypassed with frame duplication, optical flow, the old `ff04961` asset, or a raised gate.

### Fixed Batch B entry gate

Freeze these values once before Batch B. They may not be relaxed during implementation without explicit user approval:

- `HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX = 80 MiB`: a new independent metric covering the unchanged Hero video/poster, eight adopted canonical non-Hero WebMs, adopted image derivatives, and retained homepage media. Keep the existing whole-`dist/assets` `totalAssetBytes = 156 MiB` budget unchanged;
- `HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX = 4 MiB`: cold-cache transfer of Hero images, depth, and the existing poster before the first user scroll; the existing full `figure1.webm` must not transfer during loading/intro;
- `REVERSE_PRESENTED_FPS_MIN = 20`: minimum presented-frame cadence during active reverse playback on the slowest supported test device, measured from presented video frames rather than timeline callbacks.

The explicit homepage runtime-media inventory contains 38 emitted files: nine animation WebMs, eleven adopted image derivatives, the existing Hero poster, and seventeen retained scene media files. Fonts and favicon remain outside this independent media-only metric while staying covered by the existing whole-asset budget.

Record the exact host, browser build, and existing `mobile-chromium` release project used for the reverse cadence measurement. Do not raise the current JS or asset budgets to fit the integration. At `INTEGRATION_BASE_SHA`, `totalJsRawBytes` has only 42 bytes of headroom and `largestLazyJsRawBytes` only 32 bytes; the Figure2/TTG wiring commit must stop importing `directional-media-controller` before the full build gate runs.

For each adopted non-Hero clip, allow the existing short-GOP candidate and at most one all-intra fallback. If the fallback still misses a frozen gate, stop and request a decision; do not create further `vN` variants or move the threshold.

### Batch B — Switch runtime and remove old assets

1. Confirm `BATCH_A_FINAL_SHA` is the single Batch A.1 descendant of `7ea69d5`, then create the integration branch/worktree from the frozen `INTEGRATION_BASE_SHA=3b3ce381560be1cd92f043925cc4ec4120b5fcbb`.
2. Apply the asset-only range from the parent of `7ea69d5` through `BATCH_A_FINAL_SHA` without committing, and exclude `assets/hero-figure-scrub.webm` and `assets/hero-figure-scrub-poster.webp`. Do not merge or overwrite later application code or CSS from the Batch A worktree.
3. Amend `docs/assets/homepage-asset-slimming-report.md` with the integration base, retained/unadopted Hero decisions, final adopted asset SHA values, and final runtime byte totals.
4. Create the first integration commit, `perf(assets): add slim homepage derivatives`, containing only the eleven adopted image derivatives, eight adopted non-Hero WebMs, and corrected report.
5. Update imports and the minimal playback wiring listed in Section 5. Keep Hero source, poster, interval, timeline ownership, visual layers, and transition timing unchanged. Change only Figure3's approved segment duration from 2000ms to 2600ms so its normalized clip plays forward at approximately 1×.
6. Update the existing unit tests for unchanged Hero ownership, Figure3's 2600ms contract, all eight canonical non-Hero files at 30fps, prepare-first native forward playback, same-file timeline reverse playback, direction replacement, exact first/last PTS, dual-Crane activation windows, and static-media failure fallback.
7. Remove Figure2/TTG production imports of `directional-media-controller`, then run focused unit tests, lint, typecheck, and a build. Do not raise a budget if this intermediate build fails.
8. Run the strict TTG/Figure2 endpoint, mid-direction-change, and alpha-composite continuity gate against `INTEGRATION_BASE_SHA`. Run targeted forward/reverse endpoint checks for AOD, PH, Figure3, and both Crane clips, plus cold-cache, direct-hash, reduced-motion, and decode-failure checks.
9. Confirm all frozen local byte/load/cadence gates pass.
10. Only then delete replaced construction sources, dedicated reverse videos, non-Hero posters, and TTG terminal PNG. Never delete `figure1.webm` or `figure-poster.jpg`.
11. Run root `pnpm run verify:all`, confirm deleted files and both unadopted Hero candidates are absent from `dist/assets`, confirm exactly nine animation WebMs are emitted, and append final measurements to the report.

Use three local commits:

1. `perf(assets): add slim homepage derivatives`
2. `refactor(media): use canonical directional videos`
3. `perf(assets): remove replaced homepage sources`

Batch B stops as soon as Local asset candidate acceptance passes. CDN work is not part of these commits and must not block the local asset release.

## 7. Tencent Cloud CDN rollout

Current planning status on 2026-07-14:

- `assets.tongye.me` CNAME resolves to `assets.tongye.me.cdn.dnsv1.com`.
- `media.tongye.me` CNAME resolves to `media.tongye.me.cdn.dnsv1.com`.
- The DNS/TLS integration path has been mock-validated, but no server-side certificate renewal automation has been deployed.
- No accepted production asset release has been uploaded and the application has not switched to these CDN base URLs.
- Production HTTPS, COS origin authorization, cache behavior, CORS, MIME, and Range handling must all be revalidated against the final release; mock results do not satisfy this gate.

After the local build is stable:

1. Bind certificates covering `assets.tongye.me` and `media.tongye.me`, then verify normal TLS validation for both hostnames.
2. Confirm the custom domains have valid ICP filing if China-mainland or global acceleration is selected.
3. Keep the COS origin in `ap-shanghai`, preferably private-read with CDN origin authorization.
4. Publish images/fonts/poster to `assets.tongye.me` and WebM files to `media.tongye.me` under content-hashed release paths.
5. Configure two build-time base URLs with local/same-origin fallbacks. Do not add runtime configuration infrastructure.
6. Configure MIME, immutable cache headers, Range requests/Range origin fetch, and matching COS/CDN CORS headers.
7. Verify one real WebP request returns `200`, one full WebM request returns `200`, and a WebM byte-range request returns `206` over HTTPS before switching production URLs.
8. Preload only Hero static images, depth, and the existing poster. Do not preload `figure1.webm` before the first accepted Hero → Pattern intent; prefetch later scenes by navigation proximity.
9. Keep the previous release namespace for rollback.

The origin is in Shanghai; CDN delivery itself uses Tencent's distributed edge nodes.

## 8. Acceptance and stop conditions

### Local asset candidate acceptance

- `BATCH_A_FINAL_SHA` is recorded, is the single temporal-normalization descendant of `7ea69d5`, and contains no application-code changes.
- `INTEGRATION_BASE_SHA` equals `3b3ce381560be1cd92f043925cc4ec4120b5fcbb`; neither `9a602e9f` nor `d4cab48` is used as the visual sign-off baseline.
- Loading completes, then the approximately 2.7-second Hero layer/text/ink intro runs while the Hero video remains paused at its authored initial frame.
- Hero still imports `figure1.webm` and `figure-poster.jpg`, maps the Hero → Pattern segment timeline to the existing `0.34–2.34s` interval after intro completion, and seeks backward correctly when returning to Hero. Neither unadopted Hero candidate is imported or emitted.
- Each non-Hero scene prepares the correct endpoint and finishes automatically after one scroll intent: `native-preferred` forward, timeline-driven reverse.
- All eight non-Hero canonical files are 30fps. Figure2 left/right, AOD, and Figure3 are normalized to 2.6s/78 frames; TTG and both Crane files are 2.5s/75 frames; PH covers its 1.52s media leg with 46 frames and records the real final PTS/container duration. Forward playback is approximately 1× rather than decoding a longer source at 1.7–2.5×.
- Figure2, PH, AOD, and Figure3 outputs trace to the exact direct masters listed in the source-lineage table. Crane outputs trace to the named Dreamina generations and match current alpha/endpoints. TTG traces to the reacquired source that produced the `5f53013` refresh; neither the current 60-frame file upsampled to 75 nor the older `ff04961` generation is acceptable.
- Figure3 → Services uses the approved 2600ms segment duration in timing constants, manifest expectations, and tests.
- TTG and Figure2 pass every endpoint, mid-direction-change, and alpha-composited continuity check against `INTEGRATION_BASE_SHA`; whole-segment SSIM alone does not count.
- Cold cache, direct hash entry, reduced motion, and decode failure show the defined non-video static composition without a black rectangle or deleted poster.
- Exactly nine animation files are imported and emitted: unchanged `figure1.webm` plus eight canonical non-Hero WebMs. No dedicated reverse video, reverse-only element, non-Hero poster, TTG terminal PNG, `hero-figure-scrub.webm`, or generated Hero poster remains in the runtime output.
- Figure2 and Hero depth behavior remains unchanged.
- Figure2 far arch is one production WebP with no obvious compositional regression; it is not required to pixel-match the old three-pass blend. TTG baked images still match the integration baseline at supported viewports.
- Hero uses `hero-back.webp`, `hero-middle.webp`, the unchanged lossless depth PNG, unchanged `figure1.webm`, and unchanged `figure-poster.jpg`.
- Pattern and Crane use their own optimized backgrounds; AOD and Figure3 remain CSS-only paper surfaces; PH keeps its compositional background.
- The deletion record contains actual archive locations, SHA-256 values, commands, and a passing restore drill.
- Emitted homepage runtime media is at most 80 MiB, Hero pre-scroll cold transfer is at most 4 MiB, and reverse playback presents at least 20 fps on the frozen slow-device target.
- Root `pnpm run verify:all` passes, and the final report shows source bytes, output bytes, emitted runtime bytes, pre-scroll transfer, cadence evidence, and total reduction.

When every local criterion passes, stop Batch B. Do not wait for CDN, create extra optimization variants, or lower a frozen gate.

### CDN rollout acceptance

- `assets.tongye.me` serves production images/fonts/poster and `media.tongye.me` serves WebM videos over certificates valid for those exact hostnames.
- A real WebP and full WebM return `200`; a WebM Range request returns `206`.
- MIME, immutable cache, CORS, HTTPS, and origin authorization headers match the local asset contract.
- CDN object SHA-256 values match the accepted local candidate, and the previous release namespace remains available for rollback.
- Switching CDN base URLs does not regress the same-origin/local build.

CDN acceptance starts only after Local asset candidate acceptance and has its own release decision.

## 9. References

- Negative media playback-rate compatibility: [MDN `HTMLMediaElement.playbackRate`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)
- Tencent COS Shanghai region: [COS regions](https://intl.cloud.tencent.com/zh/document/product/436/6224)
- COS-backed CDN and private-origin authorization: [COS CDN acceleration](https://cloud.tencent.com/document/product/436/18670)
- China-mainland/global CDN domain requirement: [Tencent CDN domain requirements](https://cloud.tencent.com/document/product/228/43672)
- Large-file Range origin fetching: [Tencent CDN Range origin fetching](https://cloud.tencent.com/document/product/228/73703)
