import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHONE_STAGE_STOPS, phoneStageFrame } from '../phone/phone-stage-timeline';

const spikeSource = readFileSync(new URL('./PortraitScrollSpike.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../phone/PhoneStoryShell.tsx', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('../phone/PhoneStoryShell.css', import.meta.url), 'utf8');
const methodCss = readFileSync(new URL('../phone/scenes/PhoneMethodTop.css', import.meta.url), 'utf8');
const heroSource = readFileSync(new URL('../phone/scenes/PhoneHero.tsx', import.meta.url), 'utf8');
const starSource = readFileSync(new URL('../phone/scenes/PhoneStarMap.tsx', import.meta.url), 'utf8');
const aodSource = readFileSync(new URL('../phone/scenes/PhoneAod.tsx', import.meta.url), 'utf8');
const aodRuntimeSource = readFileSync(new URL('../phone/aod-autoplay.ts', import.meta.url), 'utf8');
const phoneMediaSource = readFileSync(new URL('../phone/phone-media.ts', import.meta.url), 'utf8');
const productMediaSource = readFileSync(new URL('../../story/media.ts', import.meta.url), 'utf8');
const heroPatternSource = readFileSync(new URL('../phone/transitions/hero-pattern.tsx', import.meta.url), 'utf8');
const patternStarSource = readFileSync(new URL('../phone/transitions/pattern-star-map.tsx', import.meta.url), 'utf8');

describe('Route B production extraction contract', () => {
  it('keeps v16 as a thin verification entry with no scene or media ownership', () => {
    expect(spikeSource).toContain('<PhoneStoryShell validationMode="v16" />');
    expect(spikeSource).not.toContain('createPackedAlphaVideoCompositor');
    expect(spikeSource).not.toContain('ScrollTrigger');
    expect(shellSource).not.toContain("portrait-spike/");
  });

  it('keeps the accepted two-surface stops strictly ordered', () => {
    const stops = Object.values(PHONE_STAGE_STOPS);
    expect(stops).toEqual([...stops].sort((left, right) => left - right));
    expect(phoneStageFrame(0.18)).toMatchObject({ checkpoint: 'hero-to-pattern' });
    expect(phoneStageFrame(0.54)).toMatchObject({ checkpoint: 'pattern-to-star-map' });
    expect(phoneStageFrame(0.74)).toMatchObject({ checkpoint: 'star-map-to-aod' });
    expect(phoneStageFrame(1)).toMatchObject({ checkpoint: 'aod-autoplay' });
  });

  it('keeps radial Hero and Pattern ownership in named transition adapters', () => {
    expect(heroPatternSource).toContain('origin: { x: 0.5, y: 0.44 }');
    expect(patternStarSource).toContain('origin: { x: 0.5, y: 0.28 }');
    expect(heroPatternSource).toContain("grade: 'dark'");
    expect(patternStarSource).toContain("grade: 'dark'");
  });

  it('keeps Loader, fixed rail, and one document-scroll owner in the shell', () => {
    expect(shellSource).toContain('<StoryLoader');
    expect(shellSource).toContain('attachPhoneLoaderVisibilityLifecycle');
    expect(shellSource).toContain('<PhoneStageRail');
    expect(shellCss).toMatch(/phone-story-shell__stage\s*\{[^}]*position:\s*fixed/s);
    expect(shellCss).toMatch(/phone-story-shell__stage-rail\s*\{[^}]*height:\s*var\(--phone-stage-rail-height\)/s);
    expect(shellCss).toMatch(/data-phone-stage-active="false"[^}]*display:\s*none/s);
  });

  it('keeps Figure 1 and AOD as their adapters’ packed-alpha media owners', () => {
    expect(heroSource).toContain("phoneMediaUrlFor('hero-figure-packed', 'hero')");
    expect(heroSource).toContain('createPackedAlphaVideoCompositor');
    expect(heroSource).toContain('data-phone-figure-canvas');
    expect(aodSource).toContain("phoneMediaUrlFor('aod-figure-packed-forward', 'aod-animation')");
    expect(aodSource).toContain("phoneMediaUrlFor('aod-figure-packed-reverse', 'aod-animation')");
    expect(phoneMediaSource).toContain('figure1-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('aod-figure-motion-rgb-alpha-reverse.mp4');
    expect(productMediaSource).toContain("owner: 'hero'");
    expect(productMediaSource).toContain("owner: 'aod-animation'");
    expect(aodSource).toContain('createPhoneAodAutoplay');
    expect(aodRuntimeSource).toContain("video.dataset.phoneAodAutoplay = 'suspended'");
  });

  it('keeps Star Map source, Perlin, and camera together in one phone adapter', () => {
    expect(starSource).toContain('window.devicePixelRatio');
    expect(starSource).toContain('rotationDegrees: -90');
    expect(starSource).toContain('drawSource: true');
    expect(starSource).toContain('noiseMaskWidth: 420');
    expect(starSource).toContain('wideBlur: 120');
  });

  it('preserves AOD-to-Method time ownership and a fixed Method bridge', () => {
    expect(shellSource).toContain('mapAodToMethod');
    expect(aodRuntimeSource).toContain('PHONE_AOD_METHOD_START_PROGRESS = 0.8');
    expect(methodCss).toMatch(/phone-method__bridge\s*\{[^}]*position:\s*relative[^}]*min-height:\s*var\(--phone-live-height\)/s);
    expect(methodCss).toMatch(/data-phone-stage-active="true"[^}]*phone-method__bridge\s*\{[^}]*position:\s*fixed/s);
  });
});
