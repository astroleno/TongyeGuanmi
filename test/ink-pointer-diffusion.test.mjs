import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../js/effects/ink-pointer-diffusion.js', import.meta.url);

test('pointer diffusion exposes a shared WebGL renderer built from the ink transition noise vocabulary', async () => {
  const exists = await access(moduleUrl).then(() => true, () => false);
  assert.equal(exists, true, 'the local pointer diffusion renderer must exist');

  const diffusionModule = await import(moduleUrl);
  assert.equal(typeof diffusionModule.getInkPointerDiffusion, 'function');
  assert.equal(typeof diffusionModule.createPointerDiffusionFragmentSource, 'function');

  const fragment = diffusionModule.createPointerDiffusionFragmentSource();
  assert.match(fragment, /uniform sampler2D uGlyphMask/);
  assert.match(fragment, /float fbm\(/);
  assert.match(fragment, /wet/);
  assert.match(fragment, /pore/);
  assert.match(fragment, /uPointer/);
});

test('pointer diffusion is an event-transparent overlay rather than a shadow treatment', async () => {
  const diffusionModule = await import(moduleUrl);
  const source = diffusionModule.createPointerDiffusionOverlayStyle();

  assert.match(source, /pointer-events:\s*none/);
  assert.match(source, /position:\s*fixed/);
  assert.doesNotMatch(source, /(?:box-shadow|text-shadow|drop-shadow)/);
});

test('pointer diffusion grows independent irregular droplets from glyph anchors instead of dilating an outline', async () => {
  const diffusionModule = await import(moduleUrl);
  const fragment = diffusionModule.createPointerDiffusionFragmentSource();

  assert.match(fragment, /float glyphAnchor = sampleAnchorGlyph\(anchorUv\)/);
  assert.match(fragment, /for \(int gridY = -1; gridY <= 1; gridY\+\+\)/);
  assert.match(fragment, /float dropletBody =/);
  assert.match(fragment, /float dropletTail =/);
  assert.match(fragment, /float detachedFleck =/);
  assert.match(fragment, /float gridScale = max\(4\.0, uResolution\.y \* 0\.050\)/);
  assert.match(fragment, /float bodyRadius = mix\(0\.055, 0\.135,/);
  assert.match(fragment, /float blobInk = max\(max\(dropletField, detachedFlecks\) \* outsideGlyph, contactField\)/);
  assert.doesNotMatch(fragment, /nearWet|farWet|nearCarrier|edgeBase|edgeIslands/);
});

test('pointer diffusion launches each droplet beyond a sampled glyph edge instead of clipping a blob centered in the stroke', async () => {
  const diffusionModule = await import(moduleUrl);
  const fragment = diffusionModule.createPointerDiffusionFragmentSource();

  assert.match(fragment, /float edgeExit = 1\.0 - min\(forwardGlyph, backwardGlyph\)/);
  assert.match(fragment, /vec2 outward = mix\(-axis, axis, step\(forwardGlyph, backwardGlyph\)\)/);
  assert.match(fragment, /vec2 dropCenter = anchorAspect \+ outward \* bodyRadius \*/);
  assert.match(fragment, /float edgeAnchored = anchored \* smoothstep\(/);
  assert.match(fragment, /float dropletNeck =/);
  assert.doesNotMatch(fragment, /vec2 fromCenter = aspectUv - centerAspect/);
  assert.doesNotMatch(fragment, /max\(dropletBody, dropletTail\) \* anchored/);
});

test('pointer diffusion relocates a nearby seed onto real glyph alpha and preserves only its narrow contact through the boundary', async () => {
  const diffusionModule = await import(moduleUrl);
  const fragment = diffusionModule.createPointerDiffusionFragmentSource();

  assert.match(fragment, /vec2 candidateUv = vec2\(centerAspect\.x \/ aspect, centerAspect\.y\)/);
  assert.match(fragment, /vec2 anchorUv = candidateUv/);
  assert.match(fragment, /vec2 anchorAspect = vec2\(anchorUv\.x \* aspect, anchorUv\.y\)/);
  assert.match(fragment, /float anchorCore = smoothstep\(0\.34, 0\.72, glyphAnchor\)/);
  assert.match(fragment, /float contactField = 0\.0/);
  assert.match(fragment, /contactField = max\(contactField, dropletNeck \* edgeAnchored\)/);
  assert.doesNotMatch(fragment, /glyphAnchor = max\(glyphAnchor, sampleGlyph\(anchorUv/);
});

test('glyph-anchored mode uses a stable per-gesture seed and only launches from the selected character cluster', async () => {
  const diffusionModule = await import(moduleUrl);
  const fragment = diffusionModule.createPointerDiffusionFragmentSource();

  assert.match(fragment, /uniform float uGestureSeed/);
  assert.match(fragment, /uniform float uUseActiveGlyph/);
  assert.match(fragment, /float sampleGlyph\(vec2 uv\)\s*\{\s*return texture2D\(uGlyphMask, clamp\(uv, vec2\(0\.001\), vec2\(0\.999\)\)\)\.a;/s);
  assert.match(fragment, /float sampleActiveGlyph\(vec2 uv\)/);
  assert.match(fragment, /float sampleAnchorGlyph\(vec2 uv\)/);
  assert.match(fragment, /float glyphAnchor = sampleAnchorGlyph\(anchorUv\)/);
  assert.match(fragment, /uGestureSeed/);
});
