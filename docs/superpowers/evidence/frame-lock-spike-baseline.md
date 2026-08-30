# Frame-lock Spike baseline

> This is the frozen media/frame inventory before the disposable exact-frame Spike. It is not a migration decision.

- Generated from commit: `20d2b93cd0aaafd301ede2334a40fbf4ba8a002b`
- declaredProductMinimumIOS: `UNDECLARED`
- External per-object provider limit: `UNVERIFIED_EXTERNAL_CONSTRAINT`
- Video sources: 22 (8 WebM, 8 HEVC alpha, 6 packed H.264)

## Media budgets

| Ceiling | Limit | Actual | Headroom |
| --- | ---: | ---: | ---: |
| homepageRuntimeMediaBytesMax | 83,886,080 B | 82,891,046 B | 995,034 B |
| heroBeforeFirstScrollTransferMax | 4,194,304 B | 1,255,964 B | 2,938,340 B |
| presentationWebpBytesMax | 4,194,304 B | 4,021,138 B | 173,166 B |
| allWebpBytesMax | 11,918,982 B | 11,918,200 B | 782 B |
| desktopStaticPathBytesMax | 33,554,432 B | 33,541,070 B | 13,362 B |

- `largestHomepageMediaBytes`: 11,002,083 B
- The homepage-media verifier has no 16 MiB per-asset assertion; the number above is report-only.

## Frozen animation inventory

| Source | Category | Codec | Dimensions | Frames | FPS | First PTS | Last PTS | Keyframes | Max GOP | Bytes | SHA-256 | Color SSIM | Alpha SSIM |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| assets/figure1.webm | hero-animation | vp9 | 720×1280 | 49 | 24/1 | 0 | 2 | 7 | 8 | 2,019,536 B | a472e2f9f62c9cdd447fe78664020e3dad7e0ce37900bb1c4b4e7fb1db379d70 | — | — |
| assets/figure2-pair-motion.webm | animation-webm | vp9 | 792×660 | 156 | 30/1 | 0 | 5.167 | 13 | 13 | 4,940,268 B | a87db407fd39f6977aa0b663ffd16e54929259e6651728997f7c072a33ffaa80 | — | — |
| assets/ph-figure-motion.webm | animation-webm | vp9 | 1672×942 | 46 | 30/1 | 0 | 1.5 | 6 | 8 | 2,824,934 B | 678f76a40ccffe6cc2f337bfaa6fa66d4af4f6c70b2860695491cc5003147ab1 | — | — |
| assets/ttg-figure-motion.webm | animation-webm | vp9 | 720×1280 | 75 | 30/1 | 0 | 2.467 | 10 | 8 | 2,669,734 B | 3b61c3cbcb88d8fa3ecb14faac694a4092676887a3b4cde90e80ec1bac4b0d79 | — | — |
| assets/crane-figure-motion.webm | animation-webm | vp9 | 1440×810 | 75 | 30/1 | 0 | 2.467 | 10 | 8 | 3,218,940 B | a66a6778bda2a6c2e3fb5241a69ba4f1e4422a1638608f6cc5eba57e8f53c2b9 | — | — |
| assets/crane-flock-motion.webm | animation-webm | vp9 | 1280×720 | 74 | 30/1 | 0 | 2.433 | 10 | 8 | 4,429,224 B | 708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a | — | — |
| assets/aod-figure-motion.webm | animation-webm | vp9 | 1672×941 | 78 | 30/1 | 0 | 2.567 | 10 | 8 | 1,558,857 B | 76e7a21f941a2d40e051bd72cb92e8fb1264e21a6765fbac7f8773d2849d8c9c | — | — |
| assets/figure3-motion.webm | animation-webm | vp9 | 1280×720 | 78 | 30/1 | 0 | 2.567 | 10 | 8 | 1,187,579 B | 610786ba0492be27e30690d321b8cf07c185413de95adccf0b64b964a0dcbaf7 | — | — |
| assets/figure1-hevc-alpha.mp4 | hero-animation-hevc | hevc | 720×1280 | 49 | 24/1 | 0 | 2 | 7 | 8 | 2,699,618 B | b16d04113a8b0a94c0157e7bd72eedec8c38017c42ace7ca4194da0985de2e3e | — | — |
| assets/figure2-pair-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 792×660 | 156 | 30/1 | 0 | 5.166667 | 20 | 8 | 11,002,083 B | 334db166dca9295c149c6e37379960cb01f848686e8f747931da5268477a54e8 | — | — |
| assets/ph-figure-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 1672×942 | 46 | 30/1 | 0 | 1.5 | 6 | 8 | 3,353,930 B | 70dee9eb0bf02a98ea4982978026ea3e0f21ef2c10d9d6b6493876fc87083160 | — | — |
| assets/ttg-figure-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 720×1280 | 75 | 30/1 | 0 | 2.466667 | 10 | 8 | 2,954,659 B | 9dbf4b0b6774d5c6e35f3c89d49a2c250d677b474993db9d7703bdacabc37f82 | — | — |
| assets/crane-figure-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 1440×810 | 75 | 30/1 | 0 | 2.466667 | 10 | 8 | 4,007,599 B | 935480ecb5840d0e8eae4e2eb722e5731499c9d5d4857a759f0f40e623795386 | — | — |
| assets/crane-flock-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 1280×720 | 74 | 30/1 | 0 | 2.433333 | 10 | 8 | 5,386,412 B | cb225ebced83d05b7b412fd59026f3839273019b340d922f302d3491d67acd4e | — | — |
| assets/aod-figure-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 1672×942 | 78 | 30/1 | 0 | 2.566667 | 10 | 8 | 2,337,183 B | 5a79e6fa139a487fd1576c11d9fba440cbdb5b457856ab6e5071ec3fd3e7a782 | — | — |
| assets/figure3-motion-hevc-alpha.mp4 | animation-hevc-alpha | hevc | 1280×720 | 78 | 30/1 | 0 | 2.566667 | 10 | 8 | 1,737,343 B | 18b4f5856063f2308d450a94a88d74d8fb1af5abf0966ad123c942987b550d7c | — | — |
| assets/figure1-rgb-alpha.mp4 | portrait-packed-alpha | h264 | 1440×1280 | 49 | 24/1 | 0 | 2 | 1 | 49 | 1,499,360 B | 7548484ebd66a4ebe8a8f3a95647df66558dc9ac2b6e5f0d6fc8fa5dcc445b64 | 0.945631 | 0.978013 |
| assets/figure2-pair-motion-rgb-alpha.mp4 | portrait-packed-alpha | h264 | 1584×660 | 156 | 30/1 | 0 | 5.166667 | 6 | 30 | 8,180,603 B | d472ec0767f1d113ae8020ed232c763ba53c5821deb725660601172954bc63ef | 0.982710 | 0.986634 |
| assets/aod-figure-motion-rgb-alpha.mp4 | portrait-packed-alpha | h264 | 3344×942 | 78 | 30/1 | 0 | 2.566667 | 10 | 8 | 2,637,788 B | a97af562c62e86fa4d3be9afe9537145ddeb05b67f556934985bc2dbf9f154ec | 0.969285 | 0.984430 |
| assets/ph-figure-motion-rgb-alpha.mp4 | portrait-packed-alpha | h264 | 1408×396 | 46 | 30/1 | 0 | 1.5 | 2 | 30 | 321,923 B | 39ed325feaa4afcd2c59f7479e6ad75edbe6f4f063ab2243a04afe2660c4f8e1 | 0.978457 | 0.980037 |
| assets/crane-figure-motion-rgb-alpha.mp4 | portrait-packed-alpha | h264 | 1408×396 | 75 | 30/1 | 0 | 2.466667 | 3 | 30 | 663,343 B | 80e971968a290ab1b4176cc754acdd4aaf85fecf5137a85295ccd9e7152105f5 | 0.939265 | 0.958864 |
| assets/crane-flock-motion-rgb-alpha.mp4 | portrait-packed-alpha | h264 | 2560×720 | 74 | 30/1 | 0 | 2.433333 | 3 | 30 | 1,341,930 B | 6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00 | 0.951294 | 0.949418 |

## Candidate-size risk rows

| Source | Risk |
| --- | --- |
| assets/aod-figure-motion-rgb-alpha.mp4 | 3344×942, 78 frames, current max GOP 8, 2,637,788 B; GOP 1 candidate size is unknown until measured. |
| assets/figure2-pair-motion-rgb-alpha.mp4 | 156 frames, current max GOP 30, 8,180,603 B; GOP 1 candidate size is unknown until measured. |

## Scope and provenance

- Sources are the allowlisted animation exports from `homepage-media-contract.mjs`; arbitrary directories are not scanned.
- Packed color/alpha SSIM compares the packed H.264 planes with its canonical WebM source at the packed surface dimensions.
- `UNVERIFIED_EXTERNAL_CONSTRAINT` means the checked-in CDN policy documents extension routing but no provider per-object size cap.
- Product-minimum iOS remains `UNDECLARED`; no test device is substituted for a product requirement.

