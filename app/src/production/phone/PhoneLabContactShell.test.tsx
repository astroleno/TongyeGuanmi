import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PhoneLabContactShell,
  phoneLabContactDirectEntryAutoplays,
  phoneLabContactEdgeSurface,
  phoneLabContactEntryScene,
  phoneLabContactInitialAdapterPlan,
  phoneLabContactNavigationHref
} from './PhoneLabContactShell';

const shellSource = readFileSync(new URL('./PhoneLabContactShell.tsx', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('./PhoneLabContactShell.css', import.meta.url), 'utf8');
const sceneLoaderSource = readFileSync(
  new URL('./scenes/lab-contact-loaders.ts', import.meta.url), 'utf8'
);
const transitionLoaderSource = readFileSync(
  new URL('./transitions/lab-contact-loaders.ts', import.meta.url), 'utf8'
);

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

  it('keeps acceptance navigation URLs limited to the short v query', () => {
    expect(phoneLabContactNavigationHref(
      'http://192.0.2.1:5174/?v=36&portrait-spike-motion=force#lab',
      'contact'
    )).toBe('http://192.0.2.1:5174/?v=36#contact');
  });

  it('publishes one Unit 4/5 edge surface to every Safari owner', () => {
    expect(phoneLabContactEdgeSurface('ph-animation')).toBe('#9889a5');
    for (const scene of ['lab', 'education', 'crane-animation', 'contact'] as const) {
      expect(phoneLabContactEdgeSurface(scene)).toBe('#ede4d2');
    }
    expect(shellSource).toContain("'--portrait-document-surface'");
    expect(shellSource).toContain("'--portrait-edge-surface'");
    expect(shellSource).not.toContain('--phone-lab-contact-safe-area-surface');
    expect(shellSource).not.toContain('--phone-lab-contact-measured-safe-top');
    expect(shellSource).not.toContain('data-phone-top-edge-owner');
    expect(shellSource).toContain(
      'const surface = phoneLabContactEdgeSurface(nextScene)'
    );
    expect(shellSource).toContain(
      "themeColor.setAttribute('content', surface)"
    );
    expect(shellSource).toContain("window.addEventListener('pageshow'");
    expect(shellSource).toContain("document.addEventListener('visibilitychange'");
    expect(shellSource).toContain(
      'window.getComputedStyle(root).backgroundColor'
    );
    expect(shellSource).toContain('publishEdgeScene(scene)');
    expect(shellSource).not.toContain('publishEdgeScene(target, true)');
    expect(shellSource).toContain('data-phone-stage-host="persistent"');
    expect(shellSource).toContain(
      "documentElement.dataset.phoneLabContactAcceptance = 'true'"
    );
  });

  it('extends the accepted topbar through the iOS safe-area inset', () => {
    expect(shellCss).toMatch(
      /\.site-nav\s*\{[^}]*min-height:\s*calc\(var\(--nav-h\) \+ env\(safe-area-inset-top, 0px\)\);[^}]*padding-top:\s*env\(safe-area-inset-top, 0px\);/s
    );
    expect(shellCss).toMatch(
      /\.site-nav\.has-scroll-edge-blur::before\s*\{[^}]*display:\s*block;[^}]*height:\s*calc\(var\(--nav-h\) \+ env\(safe-area-inset-top, 0px\) \+ 32px\);/s
    );
    expect(shellCss).toContain('backdrop-filter: blur(20px) saturate(1.1)');
    expect(shellCss).toContain(
      'padding-right: max(14px, env(safe-area-inset-right, 0px))'
    );
    expect(shellCss).toContain(
      'padding-left: max(14px, env(safe-area-inset-left, 0px))'
    );
    expect(shellCss).not.toContain('.site-nav::after');
    expect(shellCss).not.toContain('--phone-lab-contact-safe-top');
    expect(shellCss).not.toContain('.phone-lab-contact__top-edge');
    expect(shellCss).not.toContain('rgba(152, 137, 165, .92)');
  });

  it('retains adjacent cinematic endpoints until the next media slot is needed', () => {
    expect(shellSource).toContain('function retainCinematicEndpoint(');
    expect(shellSource).toContain(
      "root.dataset.phoneLabContactEndpoint = 'retained'"
    );
    expect(shellSource).toMatch(
      /phoneLabContactRetainsPhTerminal\(\s*cinematicRunStates\.current\['ph-animation'\],\s*cranePrewarming\s*\)[\s\S]*retireCinematic\('ph-animation', ph\)/
    );
    expect(shellSource).toMatch(
      /phoneLabContactRetainsCraneTerminal\([\s\S]*latestCraneContactRef\.current\?\.leave\?\.\(\);\s*retainCinematicEndpoint/
    );
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

  it('keeps the shared PH and Education migration bridges stateless', () => {
    for (const source of [sceneLoaderSource, transitionLoaderSource]) {
      expect(source).not.toContain('useState');
      expect(source).not.toContain('setTimeout');
      expect(source).not.toContain('requestAnimationFrame');
      expect(source).not.toContain('addEventListener');
    }
    expect(sceneLoaderSource).toContain(
      "createLabContactSceneMigrationBridge(\n          Component, 'legacy-lab-contact-ph'"
    );
    expect(sceneLoaderSource).toContain(
      "Component, 'legacy-lab-contact-education'"
    );
    expect(transitionLoaderSource).toContain(
      "module.PhoneLabPhTransition,\n          'legacy-lab-contact-lab-ph'"
    );
    expect(transitionLoaderSource).toContain(
      "module.PhonePhEducationTransition,\n          'legacy-lab-contact-ph-education'"
    );
  });

  it('never exposes the Contact lazy-loader copy in the document flow', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLabContactShell, {
      validationMode: 'v36'
    }));

    expect(markup).not.toContain('正在加载联系信息');
    expect(markup).toContain('phone-lab-contact__pending--silent');
  });

  it('overlaps each visual marker with its native receiver at one shared boundary', () => {
    expect(shellCss).not.toContain('--phone-cinematic-trigger-lane');
    expect(shellCss).toContain(
      'margin: 0 0 calc(-1 * var(--phone-cinematic-stage-height))'
    );
    expect(shellCss).toMatch(
      /\.phone-lab-contact__phase\s*\{[^}]*height: var\(--phone-cinematic-stage-height\);[^}]*min-height: var\(--phone-cinematic-stage-height\);/s
    );
    expect(shellCss).not.toContain('var(--phone-cinematic-stage-height) * 2');
    expect(shellCss).toContain('--phone-cinematic-stage-height: max(var(--portrait-live-height), 100lvh)');
    expect(shellCss).toContain('var(--portrait-stage-coverage-height)');
    expect(shellCss).toContain('--phone-cinematic-vh');
    expect(shellCss).toContain('--phone-lab-contact-edge-surface');
    expect(shellCss).toMatch(
      /\.phone-lab-contact__phase--ph,\s*\.phone-lab-contact__phase--crane\s*\{\s*background: #ede4d2;/
    );
    expect(shellCss).toMatch(
      /\.phone-lab-contact__stage--ph \.phone-lab-contact__stage-canvas,\s*\.phone-lab-contact__stage--crane \.phone-lab-contact__stage-canvas\s*\{\s*background: transparent;/
    );
    expect(shellCss).toMatch(/\.phone-lab-contact__stage-host\s*\{[^}]*position: fixed/s);
    expect(shellCss).toMatch(/\.phone-lab-contact__stage\s*\{[^}]*position: absolute/s);
    expect(shellCss).toMatch(/\.phone-lab-contact__stage-canvas\s*\{[^}]*overflow: clip/s);
    expect(shellCss).toMatch(
      /\.phone-lab-contact__stage-canvas\s*\{[^}]*contain: none;[^}]*isolation: auto;[^}]*transform: none;[^}]*backface-visibility: visible;/s
    );
    expect(shellCss).toContain(
      '[data-phone-acceptance-stage-active="false"]'
    );
    expect(shellCss).toContain('visibility: hidden !important');
    expect(shellSource).toContain('data-phone-stage-host="persistent"');
    expect(shellSource).toContain('usePhoneLabContactFixedStageRegistration');
    expect(shellSource).toContain("fixedStageRegistered ? 'registered' : 'priming'");
    expect(shellSource).toContain('usePhoneLabContactViewportGeometry(rootRef, motionEnabled)');
    expect(shellSource).toContain('widthChanged || forceRetainedGeometry');
    expect(shellSource).not.toContain("from './usePhoneViewportGeometry'");
    expect(shellCss).toContain('data-phone-lab-contact-snap="locked"');
    expect(shellCss).not.toContain('phone-lab-contact-arrival-overlap');
    expect(shellCss).not.toContain('margin-top: calc(-1 * var(--phone-lab-contact-stage-height))');
    expect(shellSource).toContain('phoneLabContactVisualBoundaryY');
    expect(shellSource).toContain('phoneLabContactCommittedBoundaryProgress');
  });

  it('uses the production gesture unlock and local cinematic snap without blocking CTA ownership', () => {
    expect(shellSource).toContain('attachStoryMediaUnlock(rootRef.current)');
    expect(shellSource).toContain('createPhoneLabContactSnapLock');
    expect(shellSource).toContain('phoneLabContactApproachProgress');
    expect(shellSource).toContain('phoneLabContactCanBeginVisualRun');
    expect(shellSource).toContain('phoneLabContactCrossedVisualStart');
    expect(shellSource).toContain('phoneLabContactCrossedVisualBoundary');
    expect(shellSource).toContain('attachPhoneLabContactReverseGesture');
    expect(shellSource).toContain('phoneLabContactCanArmReverseGesture');
    expect(shellSource).toContain('phoneLabContactVisualRunAnchor');
    expect(shellSource).toContain('beginCinematicRun(scene, -1)');
    expect(shellSource).toContain('visualRunRef.current');
    expect(shellSource).toContain('phoneLabContactPhaseAfterVisualCompletion');
    expect(shellCss).toContain('[data-phone-acceptance-chapter="lab"]');
    expect(shellSource).toContain('phoneLabContactInkBoundaryProgress');
    expect(shellSource).toContain('labPhRef.current?.render');
    expect(shellSource).toContain('educationCraneRef.current?.render');
    expect(shellSource).not.toContain("=== 'handoff'");
    expect(shellSource).toContain('if (!previous && !active)');
    expect(shellSource).toContain('previous.direction === direction');
    expect(shellSource).toContain('PHONE_LAB_CONTACT_RUN_TIMEOUT_MS');
    expect(shellSource).toContain('INTRA_CHAPTER_DISSOLVE_MS');
    expect(shellSource).toContain('runPhEducationDissolve');
    expect(shellSource).toContain('handoffVisual');
    expect(shellSource).toContain("detail.phase === 'progress'");
    expect(shellSource).toContain('latestPhEducationRef.current?.reverse?.()');
    expect(shellSource).toContain('labPhRef.current?.reverse?.()');
    expect(shellSource).toContain('latestCraneContactRef.current?.render');
    expect(shellSource).toContain('setStageActive(craneStageRef.current, false)');
    expect(shellSource).toContain('setStageActive(phStageRef.current, false)');
    expect(shellSource).not.toContain("window.scrollTo({ top: educationTop");
    expect(shellSource).not.toContain("window.scrollTo({ top: contactTop");
    expect(shellSource).toContain('armRunTimeout(detail.scene)');
    expect(shellSource).toContain("window.history.scrollRestoration = 'manual'");
    expect(shellSource).toContain("scene === 'education'");
    expect(shellSource).toContain("root?.setAttribute('aria-hidden', 'true')");
    expect(shellSource).toContain('retireCinematic');
    expect(shellSource).toContain('prepareCinematic');
    expect(shellSource).toContain('labPhRef.current?.dispose?.()');
  });
});
