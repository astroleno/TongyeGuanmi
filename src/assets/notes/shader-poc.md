# Tongye Quiet Intelligence Shader POC

Date: 2026-05-26

## Source

- Primary candidate: `reference/component/tongye_quiet_intelligence_shader_repack.zip`
- Runtime implementation:
  - `src/shaders/TongyeQuietIntelligenceShader.ts`
- Local texture reference:
  - `reference/shader/neuro-noise-glsl-shader.zip`

## Result

`tongye-quiet-intelligence-mp-poc`

MP-WEIXIN now renders a real `canvas type="webgl"` through `ShaderCanvasBackdrop`. The rejected cover-view/snapshot/static routes are not used for the main immersive scenes: normal `view/text/button` scene content stays in the page layer, while the shader remains the background layer. `StaticFieldBackdrop` is only retained for disabled shader scenes such as service package / lead fallback and forced `VITE_BACKDROP_VARIANT=static`.

Shader failures are no longer silent: init failures emit a console warning and show a small status label inside the backdrop layer during prototype verification.

`neuro-noise-glsl-shader.zip` is not used as the main shader. Its sine-field texture is borrowed inside `organicNeuroTaste()` as a subtle fiber/noise layer so the background feels more organic without becoming a generic AI-art demo.

True-device verification is still required:

- MP WebGL backdrop does not cover text, CTA, input, textarea, or form controls
- page scroll remains native and stable
- input method opening does not break layout
- background recovers after app background/foreground
- low-end devices do not show obvious frame drops or heat

## Shipping Decision

- Default backdrop is now `shader`; set `VITE_BACKDROP_VARIANT=static` to force fallback.
- H5 and MP-WEIXIN both use visible WebGL canvas rendering for the immersive shader path; MP-WEIXIN is tuned to 24fps and reduced render pixel ratio for stability.
- 9 shader states map to 12 rendered sections through `SHADER_SCENE_MAP`; `projects / service-packages / lead` share shader state 8 as calm conversion mode.
- Pretext-inspired title motion is kept in native `view/text`, with stronger scatter/align rulers and a denser typographic field overlay.
