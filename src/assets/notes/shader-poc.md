# Tongye Quiet Intelligence Shader POC

Date: 2026-05-26

## Source

- Primary candidate: `reference/component/tongye_quiet_intelligence_shader_repack.zip`
- Runtime implementation:
  - `src/shaders/TongyeQuietIntelligenceShader.ts`
- Local texture reference:
  - `reference/shader/neuro-noise-glsl-shader.zip`

## Result

`mp-css-neuro-field`

MP-WEIXIN no longer places a native `canvas type="webgl"` as the visible page background. True-device checks showed the visible WebGL path can still cover normal `view/text/button` layers, while the `cover-view` text path is too constrained for this product page.

The shipping MP background is now a native `view` / WXSS animated neuro field: continuous low-intensity motion plus a scene-change sweep keyed by `sceneId`. This keeps text, CTA, modal, cards, and forms in the normal interaction layer.

`neuro-noise-glsl-shader.zip` is not used as the main shader. Its sine-field texture is borrowed inside `organicNeuroTaste()` as a subtle fiber/noise layer so the background feels more organic without becoming a generic AI-art demo.

True-device verification is still required:

- MP background does not cover text, CTA, input, textarea, or form controls
- page scroll remains native and stable
- input method opening does not break layout
- background recovers after app background/foreground
- low-end devices do not show obvious animation jank, black flashes, or heat

## Shipping Decision

- MP-WEIXIN defaults to `StaticFieldBackdrop` even when `VITE_BACKDROP_VARIANT=shader`.
- MP-WEIXIN uses looping native view/WXSS background motion, with stronger scene-change sweeps between sections.
- `SHADER_SCENE_MAP` remains useful for non-MP shader experiments, but MP shipping behavior is scene-class-driven CSS motion.
- Pretext-inspired title motion is kept in native `view/text`; the readable title remains continuous, and character motion is decoration only.
