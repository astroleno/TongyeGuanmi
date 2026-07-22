import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PhoneLabContactShell,
  phoneLabContactDirectEntryAutoplays,
  phoneLabContactEntryScene,
  phoneLabContactInitialAdapterPlan
} from './PhoneLabContactShell';

const shellSource = readFileSync(new URL('./PhoneLabContactShell.tsx', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('./PhoneLabContactShell.css', import.meta.url), 'utf8');

describe('PhoneLabContactShell', () => {
  it('cuts the validation journey at Lab without mounting the Grade A shell', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLabContactShell, {
      validationMode: 'v36'
    }));

    expect(markup).toContain('data-phone-acceptance-route="lab-contact"');
    expect(markup).toContain('data-phone-acceptance-chapter="lab"');
    expect(markup).toContain('data-phone-acceptance-chapter="contact"');
    expect(markup).not.toContain('portrait-scroll-spike');
    expect(markup).not.toContain('PhoneGradeAStory');
  });

  it('does not expose skipped front-half destinations in the acceptance menu', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLabContactShell, {
      validationMode: 'v36'
    }));

    expect(markup).not.toContain('href="#method"');
    expect(markup).not.toContain('href="#services"');
    expect(markup).toContain('href="#contact"');
  });

  it('keeps direct target hashes inside the Lab → Contact acceptance set', () => {
    expect(phoneLabContactEntryScene('#ph-animation')).toBe('ph-animation');
    expect(phoneLabContactEntryScene('#education')).toBe('education');
    expect(phoneLabContactEntryScene('#crane-animation')).toBe('crane-animation');
    expect(phoneLabContactEntryScene('#contact')).toBe('contact');
    expect(phoneLabContactEntryScene('#services')).toBe('lab');
  });

  it('loads only Contact for direct Contact entry', () => {
    expect(phoneLabContactInitialAdapterPlan('contact')).toEqual({
      scenes: ['contact'],
      transitions: []
    });
    expect(phoneLabContactInitialAdapterPlan('lab')).toEqual({
      scenes: ['lab', 'ph-animation'],
      transitions: ['lab-ph']
    });
  });

  it('autoplays direct PH and Crane entries instead of replacing enter with an endpoint update', () => {
    expect(phoneLabContactDirectEntryAutoplays('ph-animation', false)).toBe(true);
    expect(phoneLabContactDirectEntryAutoplays('crane-animation', false)).toBe(true);
    expect(phoneLabContactDirectEntryAutoplays('education', false)).toBe(false);
    expect(phoneLabContactDirectEntryAutoplays('ph-animation', true)).toBe(false);
    expect(shellSource).toContain('!phoneLabContactDirectEntryAutoplays(entryScene, reducedMotion)');
  });

  it('never exposes the Contact lazy-loader copy in the document flow', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLabContactShell, {
      validationMode: 'v36'
    }));

    expect(markup).not.toContain('正在加载联系信息');
    expect(markup).toContain('phone-lab-contact__pending--silent');
  });

  it('keeps cinematic stages in their own document blocks', () => {
    expect(shellCss).toContain('--phone-cinematic-trigger-lane');
    expect(shellCss).toContain('+ var(--phone-cinematic-trigger-lane)');
    expect(shellCss).not.toContain('var(--phone-cinematic-stage-height) * 2');
    expect(shellCss).toContain('--phone-cinematic-stage-height: max(var(--portrait-live-height), 100lvh)');
    expect(shellCss).toContain('var(--portrait-stage-coverage-height)');
    expect(shellCss).toContain('--phone-cinematic-vh');
    expect(shellCss).toContain('--phone-lab-contact-edge-surface');
    expect(shellCss).toMatch(/\.phone-lab-contact__stage\s*\{[^}]*position: fixed/s);
    expect(shellCss).toMatch(/\.phone-lab-contact__stage-canvas\s*\{[^}]*overflow: clip/s);
    expect(shellSource).toContain('usePhoneLabContactViewportGeometry(rootRef, motionEnabled)');
    expect(shellSource).toContain('widthChanged || forceRetainedGeometry');
    expect(shellSource).not.toContain("from './usePhoneViewportGeometry'");
    expect(shellCss).toContain('data-phone-lab-contact-snap="locked"');
    expect(shellCss).not.toContain('phone-lab-contact-arrival-overlap');
    expect(shellCss).not.toContain('margin-top: calc(-1 * var(--phone-lab-contact-stage-height))');
    expect(shellSource).toContain('!phInRange && !craneInRange && educationTop');
  });

  it('uses the production gesture unlock and local cinematic snap without blocking CTA ownership', () => {
    expect(shellSource).toContain('attachStoryMediaUnlock(rootRef.current)');
    expect(shellSource).toContain('createPhoneLabContactSnapLock');
    expect(shellSource).toContain('PHONE_LAB_CONTACT_STOPS.sceneMotionEnd');
    expect(shellSource).toContain('phoneLabContactOwnsNativePlayback');
    expect(shellSource).toContain('phoneLabContactCrossedAutoplayBoundary');
    expect(shellSource).toContain('PHONE_LAB_CONTACT_SNAP_TIMEOUT_MS');
    expect(shellSource).toContain('INTRA_CHAPTER_DISSOLVE_MS');
    expect(shellSource).toContain('startPhEducationHandoff');
    expect(shellSource).toContain("window.scrollTo({ top: educationTop");
    expect(shellSource).toContain('() => releaseSnap(detail.scene)');
    expect(shellSource).toContain("window.history.scrollRestoration = 'manual'");
    expect(shellSource).toContain("scene === 'education'");
    expect(shellSource).toContain("root?.setAttribute('aria-hidden', 'true')");
  });
});
