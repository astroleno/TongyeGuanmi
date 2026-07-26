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
    expect(value).toContain(
      'createFigure2DistanceExpandTransition({ ownsMedia: false, inkCanvas: lease.canvas })'
    );
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
    expect(ph).toMatch(
      /leave\(\) \{[\s\S]*?packedSurfaceRef\.current\?\.release\(\);/
    );
    expect(crane).toMatch(
      /leave\(\) \{[\s\S]*?surface\.release\(\);/
    );
    expect(
      ph.slice(ph.indexOf('update(progress)'), ph.indexOf('enter()', ph.indexOf('update(progress)')))
    ).not.toContain('ensurePackedSurface');
    expect(
      crane.slice(
        crane.indexOf('update(progress)'),
        crane.indexOf('enter()', crane.indexOf('update(progress)'))
      )
    ).not.toContain('ensurePackedSurfaces');
  });

  it('retires Hero and AOD packed contexts when their stable owner leaves', () => {
    const hero = source('./scenes/PhoneHero.tsx');
    const aod = source('./scenes/PhoneAod.tsx');

    expect(hero).toContain('const releaseCompositor = useCallback(');
    expect(hero).toContain('renewPackedAlphaCanvas');
    expect(hero).toMatch(/leave\(\) \{[\s\S]*?releaseCompositor\(\);/);
    expect(hero).toMatch(/reverse\(\) \{[\s\S]*?ensureCompositor\(\)/);
    expect(aod).toContain('const ensureCompositor = useCallback(');
    expect(aod).toContain('renewPackedAlphaCanvas');
    expect(aod).toMatch(/leave\(\) \{[\s\S]*?releaseCompositor\(\);/);
    expect(aod).toMatch(/startAutoplay\(direction\) \{[\s\S]*?ensureCompositor\(\)/);
  });

  it('renews hard-released packed canvases before reverse reacquires WebGL', () => {
    const surface = source('./scenes/phone-packed-alpha-surface.ts');

    expect(surface).toContain('renewPackedAlphaCanvas');
    expect(surface).toContain('externalCanvas = renewPackedAlphaCanvas(canvas)');
  });
});
