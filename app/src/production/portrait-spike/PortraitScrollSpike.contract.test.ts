import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const spikeSource = readFileSync(new URL('./PortraitScrollSpike.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../phone/PhoneStoryShell.tsx', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('../phone/PhoneStoryShell.css', import.meta.url), 'utf8');
const phoneMediaSource = readFileSync(new URL('../phone/phone-media.ts', import.meta.url), 'utf8');

describe('Route B proven front-half migration contract', () => {
  it('keeps v16 as a thin verification entry while the production phone shell owns the complete spike', () => {
    expect(spikeSource).toContain('<PhoneStoryShell validationMode="v16" />');
    expect(shellSource).toContain('export function PhoneStoryShell');
    expect(shellSource).toContain('<StoryLoader');
    expect(shellSource).toContain('portrait-scroll-spike__scene--hero');
    expect(shellSource).toContain('portrait-scroll-spike__scene--pattern');
    expect(shellSource).toContain('portrait-scroll-spike__scene--star');
    expect(shellSource).toContain('portrait-scroll-spike__scene--aod');
    expect(shellSource).toContain('id="method"');
  });

  it('preserves the spike as one document-scroll owner with a fixed visual stage', () => {
    expect(shellSource).toContain("id: 'portrait-spike-stage'");
    expect(shellSource).toContain("root.dataset.portraitStagePin = 'native-fixed'");
    expect(shellCss).toMatch(/portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed/s);
    expect(shellCss).toMatch(/portrait-scroll-spike__stage-rail\s*\{[^}]*height:\s*var\(--portrait-stage-rail-height\)/s);
    expect(shellCss).toMatch(/touch-action:\s*pan-y/);
  });

  it('keeps all three authored ink handoffs as one coherent front-half chain', () => {
    expect(shellSource).toContain('createPhoneInkTransition');
    expect(shellSource).toContain('data-portrait-ink="hero-pattern"');
    expect(shellSource).toContain('data-portrait-ink="pattern-star"');
    expect(shellSource).toContain('data-portrait-ink="star-aod"');
    expect(shellSource).toContain("'handoff-hero-pattern'");
    expect(shellSource).toContain("'handoff-pattern-star'");
    expect(shellSource).toContain("'handoff-star-aod'");
  });

  it('keeps Figure 1 and AOD packed-alpha media in the proven ownership path', () => {
    expect(shellSource).toContain('createPackedAlphaVideoCompositor');
    expect(shellSource).toContain("phoneMediaUrlFor('hero-figure-packed', 'hero')");
    expect(shellSource).toContain("phoneMediaUrlFor('aod-figure-packed-forward', 'aod-animation')");
    expect(shellSource).toContain("phoneMediaUrlFor('aod-figure-packed-reverse', 'aod-animation')");
    expect(phoneMediaSource).toContain('figure1-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('aod-figure-motion-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('aod-figure-motion-rgb-alpha-reverse.mp4');
    expect(shellSource).toContain('data-portrait-figure-canvas');
  });

  it('keeps the established Star Map camera and AOD-to-Method handoff together', () => {
    expect(shellSource).toContain('rotationDegrees: -90');
    expect(shellSource).toContain('phoneAodBackdropPresentation');
    expect(shellSource).toContain('phoneAodMethodProgress');
    expect(shellSource).toContain('root.dataset.portraitAodMethodVisible');
    expect(shellCss).toMatch(/portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*relative/s);
    expect(shellCss).toMatch(/data-portrait-stage-active="true"[^}]*portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*fixed/s);
  });

  it('moves completed helper ownership into the production phone directory', () => {
    expect(shellSource).toContain("from './hero-motion'");
    expect(shellSource).toContain("from './phone-ink'");
    expect(shellSource).toContain("from './aod-autoplay'");
    expect(shellSource).not.toContain("from '../portrait-spike/");
  });
});
