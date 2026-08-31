# Frame-lock Spike results

- Date: 2026-08-31 (approval addendum)
- Branch: `codex/frame-lock-seek-migration`
- Spike baseline commit: `51af8db` (`feat(harness): prove packed-alpha and Crane frame barriers`)
- Frozen media baseline: `966d651`
- Candidate outputs: temporary files under `tmp/frame-lock-spike/`; no frozen asset was overwritten
- Declared product minimum iOS: `UNDECLARED`
- `minimumSupportedIOSForFrameLock`: `CERTIFIED_SET_PENDING_TASK_21`
- Eligibility contract: `app/scripts/frame-lock-eligibility-contract.json`
- Eligibility contract SHA-256: `19b632f391a8b3e68d0d3a8ce6d2178092d34ecca600950e2d7ad74abcaa8c1c`
- Approval ID: `frame-lock-spike-2026-08-31-go-full`

Decision: GO_FULL

The original automated checkpoint below was recorded as `NO_GO` before the mobile fixes and real-device review. It is retained as historical evidence, not as the active decision. After the strict receipt recovery and fail-closed boundary fixes, the user approved `GO_FULL` by replying `继续` on 2026-08-31. This authorizes migration of all listed cinematic direction groups; it does not invent an iOS certification floor. Task 21 must still record the exact iPhone model, iOS/Safari version, and final release certificate before release completion.

The user-provided iPhone Safari screenshots showed `ready`, exact presented rows, zero lag, and the expected pressure-mode `media receipt required · copy/dissolve locked` state. The screenshots did not expose a reliable device model or iOS/Safari version, so those fields remain uncaptured rather than inferred.

Post-fix automated evidence: the frame-lock Playwright matrix completed 32/32 tests across desktop Chromium, desktop WebKit, phone Chromium, and phone WebKit. A focused mobile WebKit stress replay completed 100/100 cases across PH and Crane routes with exact accepted rows, zero lag, zero Crane child-frame difference, and no stale commit. The frozen binaries were not replaced because no selected asset required promotion.

## Gates and support policy

| Gate | Result | Evidence |
| --- | --- | --- |
| Wrong presented-frame receipts | 0 in every presented row observed | RVFC rows and barrier unit/E2E assertions |
| Logical frame lag | 0 in every presented row observed | exact integer frame comparison |
| Stale receipt commits | 0 | stale rows never set presented state |
| Strict evidence | RVFC only for direct video; Canvas/barrier paths fail closed | no `seeked`, `currentTime`, or `rAF` row is accepted as proof |
| Seek-to-present P95/P99 | Blink direct-video maximum observed 50.7/50.7 ms | 4 direction sequences on the raw sweep; pressure uses stale latest-wins receipts |
| Two consecutive UI frames over 50 ms | `NOT_INSTRUMENTED` | the disposable harness records seek latency, not compositor frame-duration traces |
| Alpha/packed Canvas proof | FAIL in the local automated browsers | all six packed sources report `setup-failed` because WebGL is unavailable in this runner |
| Aggregate media budget | GOP 8 packed set stays within the existing ceiling; several GOP 1 choices do not | projections below |
| Real iPhone Safari | NOT RUN | no accessible real device or remote Safari target |

Below `minimumSupportedIOSForFrameLock`, and whenever RVFC or the required packed Canvas proof is unavailable, the permitted policy remains static/unsupported fail-closed behavior. No user-agent split is introduced. The Playwright iPhone descriptor is synthetic and is not used to infer an iOS support floor.

## Automated browser matrix

The raw surface sweep loaded all 22 allowlisted sources and ran the fixed forward sequence. PH and Crane were additionally run through forward, reverse, endpoint, seeded-random, and latest-wins pressure cases.

| Project | Capability observed | WebM | HEVC alpha | Packed H.264 |
| --- | --- | ---: | ---: | ---: |
| `desktop-chromium` | Blink 149.0.7827.55, RVFC present | 8/8 exact | 8/8 exact | 0/6; `setup-failed` |
| `phone-chromium` | Blink 149.0.7827.55, emulated Android 14, RVFC present | 8/8 exact | 8/8 exact | 0/6; `setup-failed` |
| `desktop-webkit` | WebKit 26.5, RVFC present | 0/8 strict; 7 stale rows per source | 5/8 exact; 3 partial/fail | 0/6; `setup-failed` |
| `phone-webkit` | WebKit 26.5, emulated iOS 15.0/iPhone 13, RVFC present | 0/8 strict; 7 stale rows per source | 7/8 exact; Figure2 had 2 stale rows | 0/6; `setup-failed` |

For all direct-video rows that were accepted, `desiredFrameIndex === presentedFrameIndex`, `frameLag === 0`, and `committed === true`. Pressure sequences intentionally create stale work; no stale row becomes the presented clock. The WebKit rows that did not produce a receipt remain fail-closed and are not treated as successful strict proof.

The integrated suites completed as follows:

- PH release-like Spike suite: 20/20 tests passed across the four projects.
- Crane/packed-alpha suite: 4/4 tests passed across the four projects. In this environment the tests exercised the explicit failure-and-retirement path; the two Canvas contexts were released without allowing a partial Crane commit.
- Spike unit suite: 6 files, 19 tests passed.
- Candidate parser: 2/2 Node tests passed.

The browser platform does not expose native decoder-memory peaks. The sweep therefore records the observable resource shape: one video and no Canvas for direct assets; one video and one Canvas for a packed asset; two videos and two Canvases for Crane. Native decoder peak, Canvas GPU bytes, and WebGL memory peak are `NOT_EXPOSED`, not assumed to pass.

## Candidate encodes

Every candidate preserved the source dimensions, frame count, rational frame rate, first/last PTS, and the requested maximum GOP. Packed color/alpha SSIM below compares the left/right packed planes against the frozen packed source; it is a visual candidate diagnostic, not a substitute for the missing active-generation Canvas receipt.

| Packed source | Frozen bytes | GOP 8 bytes / delta | GOP 8 color / alpha SSIM | GOP 1 bytes / delta | GOP 1 color / alpha SSIM |
| --- | ---: | ---: | ---: | ---: | ---: |
| `figure1-rgb-alpha.mp4` | 1,499,360 | 1,240,592 / -258,768 | 0.991251 / 0.993535 | 2,418,713 / +919,353 | 0.989739 / 0.989638 |
| `figure2-pair-motion-rgb-alpha.mp4` | 8,180,603 | 8,970,440 / +789,837 | 0.995504 / 0.995459 | 16,870,831 / +8,690,228 | 0.991741 / 0.989385 |
| `aod-figure-motion-rgb-alpha.mp4` | 2,637,788 | 2,702,544 / +64,756 | 0.989167 / 0.997195 | 6,045,950 / +3,408,162 | 0.988350 / 0.996690 |
| `ph-figure-motion-rgb-alpha.mp4` | 321,923 | 441,887 / +119,964 | 0.987054 / 0.981799 | 1,218,558 / +896,635 | 0.980175 / 0.974636 |
| `crane-figure-motion-rgb-alpha.mp4` | 663,343 | 728,882 / +65,539 | 0.990491 / 0.991267 | 1,062,541 / +399,198 | 0.989573 / 0.987552 |
| `crane-flock-motion-rgb-alpha.mp4` | 1,341,930 | 1,427,975 / +86,045 | 0.990514 / 0.982146 | 1,951,850 / +609,920 | 0.990110 / 0.978115 |

Candidate shape qualification also covered `ph-figure-motion.webm` at GOP 8, `crane-figure-motion.webm` at GOP 8 and GOP 1, plus GOP 8 HEVC candidates for all eight semantic sources. All 23 generated candidates passed the ffprobe shape check. The direct candidate replay could not turn the packed setup failure into a Canvas proof. The route-injected Crane WebM replay produced only 2/7 presented rows for both GOP choices and was not qualified.

Candidate SHA-256 values for the packed replay set:

| Source | GOP 8 SHA-256 | GOP 1 SHA-256 |
| --- | --- | --- |
| `figure1-rgb-alpha.mp4` | `acc33a4cbd02dbbde6fb795b6f0dd98d50ead1cc42d1f0e19e78dd66a9423f72` | `37cb3e4818131a524d3161b87efee117ee3fc05c2aab0a227e936c093dcb3855` |
| `figure2-pair-motion-rgb-alpha.mp4` | `27e14af2e7104eb7e905e567dd706b614f8ad1057d6442668a227c9ca9b9084e` | `aa7ea5fae8a9cf0f5b7a1b667ed569fdfe33f246995692b2b004ac07f4b59192` |
| `aod-figure-motion-rgb-alpha.mp4` | `08f6c50ddbb5b1b290430771c1332c8efad04967dec4d3e850b1447caf741eee` | `b5e8cffe5445465d6d5d4b28900a0cfcdea38f075a6183e3075db2379e838806` |
| `ph-figure-motion-rgb-alpha.mp4` | `8937a401dfc89648d3d03a2d4326e10a8cf5adb2655a3d1bd97bf53f3372b1e2` | `61db3637510ade4833b9fd930c5907a11bf230202b10fb536125164913b31ae8` |
| `crane-figure-motion-rgb-alpha.mp4` | `58ae90d9f3a5c70c87b5614073750de8f8e84df8effa00cb9498ebf32882dca8` | `b092b86d130c1054a8b5c169d4d99a5e3774b30f2c0e8cf813fb2f7e93a7eab9` |
| `crane-flock-motion-rgb-alpha.mp4` | `afa1022854c0e123e5760b2ba72f28d68540a2644ce49d771edb89d78a0c8324` | `e0059c11a245cd483ab574f0df13378a150cfee663bd4bc50807959217fd33c9` |

## Budget projections

The frozen homepage runtime-media total is 82,891,046 B with a ceiling of 83,886,080 B and 995,034 B headroom. No budget was raised.

| Replacement set | Projected runtime-media total | Headroom |
| --- | ---: | ---: |
| All six packed GOP 8 candidates | 83,758,419 B | 127,661 B |
| Figure2 packed GOP 1 alone | 91,581,274 B | -7,695,194 B |
| AOD packed GOP 1 alone | 86,299,208 B | -2,413,128 B |
| Crane figure + flock GOP 8 as one atomic group | 83,042,630 B | 843,450 B |
| Crane figure + flock GOP 1 as one atomic group | 83,900,164 B | -14,084 B |

The GOP 8 packed set is budget-safe in projection, but it remains unselected because no binary promotion was required by the approved decision. The GOP 1 Figure2, AOD, and atomic Crane choices are ineligible on the existing aggregate budget alone. No 16 MiB per-asset budget is claimed.

## Eligibility table

The following is the frozen `GO_FULL` cinematic direction inventory. The same direction IDs are used for desktop and phone; no hidden user-agent split is introduced.

| Semantic / atomic group | Exact direction IDs | Desktop result | Phone result | Preserved behavior |
| --- | --- | --- | --- | --- |
| Hero | `hero-pattern/forward`, `hero-pattern/reverse` | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |
| AOD | `star-map-aod/{forward,reverse}`, `aod-method-top/{forward,reverse}` | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |
| Figure2 | `method-bottom-figure2/{forward,reverse}`, `figure2-distance-expand/{forward,reverse}` | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |
| Figure3 | `brand-figure3/{forward,reverse}`, `figure3-services/{forward,reverse}` | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |
| TTG | `services-ttg/{forward,reverse}`, `ttg-lab/{forward,reverse}` | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |
| PH | `lab-ph/{forward,reverse}`, `ph-education/{forward,reverse}` | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |
| Crane atomic pair | `education-crane/{forward,reverse}`, `crane-contact/{forward,reverse}`; figure/flock are indivisible | GO_FULL | GO_FULL | strict frame-lock, subject to certified-capability fail-closed policy |

No asset variant is selected for promotion: Hero, AOD, Figure2, Figure3, TTG, PH, and the Crane figure/flock pair all retain their frozen variants. The Hero rebuild script is retained as a reproducibility/staging check; it does not overwrite the frozen asset.

## Real-device checkpoint

The screenshots supplied by the user are real iPhone Safari evidence for the reviewed routes, but the model and iOS/Safari version were not captured. Consequently the exact certified version set, real decoder-memory peak, and product minimum remain open for Task 21. The emulated `phone-webkit` row is recorded only as an automated compatibility signal and does not lower or establish the product minimum.

### Task 16 PH vertical slice

| Evidence | Result |
| --- | --- |
| User-supplied iPhone Safari screenshots after the PH route retry fix | PH rendered, the endpoint receipt was accepted, and the visible presented-frame rows matched their desired frames with zero displayed lag (including the observed `0`, `45`, `1`, `44`, and `23` sequence). |
| Device and browser identity | Not captured in the screenshots; this is supporting evidence only and does not close the Task 21 certified-device gate. |
| Formal-route duplicate registration | Covered by the release phone retry test; a same-entry retry completed without an `already registered` failure. |

## Verification commands

The following automated checks passed on the isolated branch:

```text
node --test scripts/rebuild-frame-lock-spike-candidates.test.mjs   PASS (2 tests)
pnpm vitest run src/harness/frame-lock-spike                       PASS (6 files, 19 tests)
pnpm typecheck                                                    PASS
pnpm build                                                         PASS
pnpm verify:media:deep                                            PASS
pnpm verify:phone-packed-alpha                                    PASS
pnpm exec playwright test --config playwright.frame-lock.config.ts --grep "PH"       PASS (20)
pnpm exec playwright test --config playwright.frame-lock.config.ts --grep "Crane|packed" PASS (4)
```

`pnpm verify:media` also passed as part of the final build after `dist/` was generated. The release/CDN manifests were generated from the frozen asset set; no candidate binary was promoted, so no production manifest hash changed.
