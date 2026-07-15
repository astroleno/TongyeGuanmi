# Homepage media archive — 2026-07-15

This archive removes authoring, debug, dedicated-reverse, poster, and superseded media from the production `assets/` namespace without deleting their repository blobs.

## Layout

- `legacy/assets/**`: 62 files formerly under `assets/**`, preserving their original relative paths. At archive time they were absent from the frozen homepage runtime inventory and had no references from `app/`, `src/`, `scripts/`, `index.html`, or `package.json`.
- `replaced/figure1-1080x1920-full-5.042s.webm`: the former 10,639,235-byte Hero source, SHA-256 `14d881a16c0bef8f12526100aca1d014e0b8d38d8d09510e3c2aa43bb0030c35`.
- `replaced/crane-flock-motion-75f-lossless-terminal-hold.webm`: the former 9,696,197-byte lossless flock output, SHA-256 `147625e4002f422ffa6eef619f4d1973368d652b1badf786f6311fa046fe2516`.
- `replaced/crane-flock-motion-74f-crf18-flawed-first-frame.webm`: the former 4,437,203-byte, 74-frame CRF 18 flock output whose decoded frame 0 retained the flawed matte, SHA-256 `f7ea022c4fa6f2417e7bda8e2a8f3fe69688ddb872f7bd5ffd626b6805c8989c`.
- `replaced/crane-figure-motion-75f-lossless-single-source.webm`: the former 13,554,565-byte lossless, single-RGBA-source Crane figure output, SHA-256 `b96e527dd4a61fecca4ef26a5892dac76147ab38a66724cc36043ab9b8d681e4`.
- `sources/crane-flock-74f-authority.webm`: the 2,651,324-byte, 74-author-frame alpha authority from `ac46a868e13ca286ea3a6cdfad71c5b6e0ca37b1:assets/crane-figure2-transition.webm`, SHA-256 `b96e13b85f85a70c0e71d2f9c11ac64aca1830fa6af3c1ee3b7272133cf09457`.
- `sources/crane-flock-first-frame-flawed.png`: the historical 1280×720 RGBA still from `ac46a868e13ca286ea3a6cdfad71c5b6e0ca37b1:assets/crane-figure2-first-frame.png`, SHA-256 `f4a1b1572b8743ae2c1a3a187abc7cc6b772f26ff63fbf19093bb10d8849cde3`. The canvas-edge flood-fill rebuild produces the 80,116-byte `assets/crane-flock-first-frame.webp` (SHA-256 `8c4d47ca59d21c14430c02b2d89605594463a018e28c25c7eeb8fd824f8910b4`), which is both the pre-decode poster and the source embedded into canonical WebM frame 0.

The `legacy/assets/**` move preserves Git blob identity. To restore one archived path, copy it back after removing the `archive/assets/homepage-media/2026-07-15/legacy/` prefix. Replaced canonical files can be restored directly to their corresponding production names; the lossless Crane figure archive restores to `assets/crane-figure-motion.webm`.

Except for the explicitly archived superseded outputs above, current production outputs are not duplicated here. Their identities, encoding commands, frame/alpha checks, and runtime terminal-hold contract are frozen in `docs/assets/homepage-asset-slimming-report.md` and `app/scripts/homepage-media-contract.mjs`.
