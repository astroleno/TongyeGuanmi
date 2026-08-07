import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

describe('phone WebGL allocation lifecycle', () => {
  it('does not allocate generic ink renderers merely because adapters mounted', () => {
    const value = source('./transitions/PhoneInkTransition.tsx');
    const mountEffect = value.slice(
      value.indexOf('useLayoutEffect(() =>'),
      value.indexOf('useImperativeHandle(')
    );
    expect(mountEffect).not.toContain('ensure();');
    expect(value).toContain('claimPhoneInkSurface');
    expect(value).toContain('leaseRef.current?.release()');
    expect(value).toMatch(
      /sampled > 0 && sampled < 1\) \|\| explicitOwnershipRef\.current/
    );
  });

  it('builds Figure2 depth ink in prepare and releases it at the endpoint', () => {
    const value = source('./transitions/figure2-distance-expand.tsx');
    const figure2 = source('./scenes/PhoneFigure2.tsx');
    const mountEffect = value.slice(
      value.indexOf('useLayoutEffect(() =>'),
      value.indexOf('useImperativeHandle(')
    );
    expect(mountEffect).not.toContain('buildTimeline');
    expect(value).toContain('await ensureTimeline(direction)');
    expect(value).toMatch(/releaseEndpoint\(\) \{\s*releaseTimeline\(\);/);
    expect(value).not.toContain('phone-figure2-');
    expect(value).toContain(
      'claimPhoneInkSurface'
    );
    expect(value).toContain('createPhoneFigure2DistanceExpandBridge([');
    expect(value).not.toContain('createFigure2DistanceExpandTransition({');
    expect(value).toContain('leaseRef.current?.release()');
    expect(figure2).toContain('prepareTargetPresentation');
    expect(figure2).toContain('sceneActiveRef.current === active');
  });

  it('keeps future Figure2, PH, and Crane packed compositors cold until prepare/entry', () => {
    const figure2 = source('./scenes/PhoneFigure2.tsx');
    const ph = source('../../scenes/ph-animation/phone/PhonePh.tsx');
    const crane = source('../../scenes/crane-animation/phone/PhoneCrane.tsx');

    expect(figure2).toContain('const ensurePackedSurface = useCallback(');
    expect(figure2).not.toMatch(
      /useLayoutEffect\(\(\) => \{[\s\S]*?createPhonePackedAlphaSurface/
    );
    expect(
      figure2.slice(
        figure2.indexOf('const setSceneActive = useCallback('),
        figure2.indexOf('const registerHandle')
      )
    ).not.toContain('ensurePackedSurface');
    expect(ph).not.toContain(
      "ensurePackedSurface(reducedMotion ? 'endpoint' : 'forward');"
    );
    expect(crane).not.toContain(
      "ensurePackedSurfaces(reducedMotion ? 'endpoint' : 'forward');"
    );
    expect(ph).not.toMatch(/\n\s*update\(/);
    expect(ph).not.toMatch(/\n\s*leave\(/);
    expect(crane).not.toMatch(/\n\s*update\(/);
    expect(crane).not.toMatch(/\n\s*leave\(/);
  });

  it('retires Hero and AOD packed contexts when their stable owner leaves', () => {
    const hero = source('./scenes/PhoneHero.tsx');
    const aod = source('./scenes/PhoneAod.tsx');
    const heroProjectionLease = hero.slice(
      hero.indexOf('useLayoutEffect(() => {\n      sceneActiveRef.current = active;'),
      hero.indexOf('\n    useImperativeHandle(', hero.indexOf(
        'useLayoutEffect(() => {\n      sceneActiveRef.current = active;'
      ))
    );
    const aodProjectionLease = aod.slice(
      aod.indexOf('// `active` is strictly a decoder/compositor lease.'),
      aod.indexOf('\n    useImperativeHandle(', aod.indexOf(
        '// `active` is strictly a decoder/compositor lease.'
      ))
    );

    expect(hero).toContain('const releaseCompositor = useCallback(');
    expect(hero).toContain('renewPackedAlphaCanvas');
    expect(hero).not.toMatch(/\n\s*leave\(\) \{/);
    expect(hero).not.toMatch(/\n\s*reverse\(\) \{/);
    expect(heroProjectionLease).toContain('releaseGpuOwners();');
    expect(heroProjectionLease).toContain('ensureCompositor()?.setActive(true);');
    expect(aod).toContain('const ensureCompositor = useCallback(');
    expect(aod).toContain('renewPackedAlphaCanvas');
    expect(aod).not.toMatch(/\n\s*leave\(\) \{/);
    expect(aod).not.toMatch(/\n\s*reverse\(\) \{/);
    expect(aodProjectionLease).toContain('releaseCompositor();');
    expect(aod).toMatch(/startAutoplay\(execution\) \{[\s\S]*?ensureCompositor\(\)/);
  });

  it("[convergence] keeps AOD's warmed compositor through a token rebind", () => {
    const aod = source('./scenes/PhoneAod.tsx');
    const startAutoplay = aod.slice(
      aod.indexOf('startAutoplay(execution) {'),
      aod.indexOf('presentPresentation(token, report, fail) {')
    );

    expect(startAutoplay).not.toContain('releaseCompositor();');
    expect(startAutoplay).toContain('const compositor = ensureCompositor();');
    expect(startAutoplay).toContain('compositor.setActive(true);');
  });

  it('keeps Hero GPU owners cold while a direct downstream route mounts the reversible graph', () => {
    const hero = source('./scenes/PhoneHero.tsx');
    const mountEffect = hero.slice(
      hero.indexOf('useLayoutEffect(() => {\n      const root = rootRef.current;'),
      hero.indexOf('\n    useLayoutEffect(() => {\n      sceneActiveRef.current = active;')
    );

    expect(hero).toContain('const ensureIntroInk = useCallback(() =>');
    expect(mountEffect).not.toContain('ensureCompositor();');
    expect(mountEffect).not.toContain("introInk(['prewarm']);");
    // Reduced motion still needs one paused packed-alpha draw to make the
    // Loader handoff real; only playback/parallax stay disabled. Direct
    // downstream routes remain cold because `active` is false there.
    expect(hero).toContain('if (active) {');
    expect(hero).toContain('ensureCompositor()?.setActive(true);');
    expect(hero).toContain("ensureIntroInk()?.(['prewarm']);");
    expect(hero).toContain('playbackRef.current?.setActive(active && !reducedMotion);');
  });

  it('retires both Hero GPU owners when direct-entry handoff makes Hero inactive', () => {
    const hero = source('./scenes/PhoneHero.tsx');
    const activeLease = hero.slice(
      hero.indexOf('useLayoutEffect(() => {\n      sceneActiveRef.current = active;'),
      hero.indexOf('\n    useImperativeHandle(', hero.indexOf(
        'useLayoutEffect(() => {\n      sceneActiveRef.current = active;'
      ))
    );

    // A deep link temporarily boots the Hero plane so Loader can obtain its
    // opening poster, then transfers authority to a downstream scene. The
    // inactive branch is the sole retirement point for both Hero contexts;
    // merely deactivating a decoder leaves a dormant WebGL owner that can
    // breach the global cap when a later Group67 ink field is admitted.
    const releaseGpuOwners = hero.slice(
      hero.indexOf('const releaseGpuOwners = useCallback('),
      hero.indexOf('const ensureCompositor = useCallback(')
    );

    expect(activeLease).toContain('cancelEntrance();');
    expect(activeLease).toContain('releaseGpuOwners();');
    expect(releaseGpuOwners).toContain('releaseCompositor();');
    expect(releaseGpuOwners).toContain("introInkRef.current?.(['dispose']);");
    expect(releaseGpuOwners).toContain('introInkRef.current = undefined;');
  });

  it('keeps packed Canvas ownership inside the surface lifecycle', () => {
    const surface = source('./scenes/phone-packed-alpha-surface.ts');
    const packedVideo = source('../../media/packed-alpha-video.ts');

    expect(surface).not.toContain('renewPackedAlphaCanvas');
    expect(surface).not.toContain('externalCanvas');
    expect(surface).toContain('canvas.remove();');
    expect(packedVideo).not.toContain('cloneNode');
    expect(packedVideo).not.toContain('replaceWith');
    expect(packedVideo).toContain('canvas.width = 1;');
  });
});
