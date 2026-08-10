import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneViewportCoverageController,
  readPhoneCoverageViewport,
  readPhoneLayoutViewport,
  type PhoneViewportWindow
} from './phone-story/presentation';

const stageRailStyles = readFileSync(
  new URL('./PhoneStageRail.css', import.meta.url),
  'utf8'
);
const stageRailSource = readFileSync(
  new URL('./PhoneStageRail.tsx', import.meta.url),
  'utf8'
);
const presentationSource = readFileSync(
  new URL('./phone-story/presentation.ts', import.meta.url),
  'utf8'
);
const presentationStyles = readFileSync(
  new URL('./phone-story/presentation.css', import.meta.url),
  'utf8'
);
const patternStyles = readFileSync(
  new URL('./scenes/PhonePattern.css', import.meta.url),
  'utf8'
);
const methodStyles = readFileSync(
  new URL('./scenes/PhoneMethodTop.css', import.meta.url),
  'utf8'
);
const figure2Styles = readFileSync(
  new URL('./scenes/PhoneFigure2.css', import.meta.url),
  'utf8'
);

function fixture() {
  const visualViewport = Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    width: 390,
    height: 844
  });
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const windowRef = Object.assign(new EventTarget(), {
    innerWidth: 390,
    innerHeight: 844,
    visualViewport,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      callbacks.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => callbacks.delete(id))
  }) as unknown as PhoneViewportWindow;
  const values = new Map<string, string>();
  const root = {
    style: {
      setProperty: vi.fn((name: string, value: string) => values.set(name, value)),
      removeProperty: vi.fn((name: string) => values.delete(name))
    },
    dataset: {} as DOMStringMap
  } as unknown as HTMLElement;
  const documentRef = new EventTarget();
  const flushFrame = () => {
    const frame = [...callbacks.entries()][0];
    if (!frame) throw new Error('Expected one scheduled coverage frame');
    callbacks.delete(frame[0]);
    frame[1](0);
  };
  return { visualViewport, windowRef, root, documentRef, values, flushFrame, callbacks };
}

describe('phone live viewport coverage', () => {
  it('[front-half gate] keeps the frozen stage canvas opaque while the live viewport backing is a separate DOM host', () => {
    const canvasComment = stageRailStyles.indexOf(
      '/* The retained layout canvas is frozen'
    );
    const canvasStart = stageRailStyles.indexOf(
      '.portrait-scroll-spike__stage-canvas {',
      canvasComment
    );
    const stageCanvas = stageRailStyles.slice(
      canvasStart,
      stageRailStyles.indexOf('}', canvasStart) + 1
    );

    expect(stageCanvas).toContain('height: max(100%, var(--portrait-stage-canvas-height));');
    expect(stageCanvas).toContain('background: var(--portrait-edge-surface);');
    expect(stageCanvas).not.toContain('background: transparent;');
    expect(presentationStyles).not.toContain('--portrait-coverage-height');
    expect(presentationStyles).not.toContain('--portrait-stage-canvas-height');
  });

  it('[P0 Safari coverage] freezes the content and route hosts while a real DOM backdrop alone may extend', () => {
    const stage = stageRailStyles.slice(
      stageRailStyles.indexOf('.portrait-scroll-spike__stage {'),
      stageRailStyles.indexOf('.portrait-scroll-spike__viewport-coverage {')
    );
    const coverage = stageRailStyles.slice(
      stageRailStyles.indexOf('.portrait-scroll-spike__viewport-coverage {'),
      stageRailStyles.indexOf('/* Above-both effects are route siblings,')
    );
    const overlay = stageRailStyles.slice(
      stageRailStyles.indexOf('.portrait-scroll-spike__route-overlay {'),
      stageRailStyles.indexOf('.portrait-scroll-spike__route-overlay > canvas')
    );

    expect(stage).toContain('inset: 0;');
    expect(stage).not.toContain('--portrait-coverage-');
    expect(overlay).toContain('inset: 0;');
    expect(overlay).not.toContain('--portrait-coverage-');
    expect(coverage).toContain('inset: 0 auto auto 0;');
    expect(coverage).toContain('width: max(100%, var(--portrait-coverage-right));');
    expect(coverage).toContain('height: max(100%, var(--portrait-coverage-bottom));');
    expect(stageRailSource).toContain('data-phone-presentation-host="coverage"');
    expect(stageRailStyles).not.toContain('.portrait-scroll-spike__stage-rail::before');
  });

  it('[P0 Safari coverage] paints front-half viewport backing with scene imagery, never only the fallback edge color', () => {
    expect(patternStyles).toContain('background: #d9c08f;');
    expect(presentationSource).toContain("PHONE_PATTERN_TERMINAL_EDGE_SURFACE = '#d9c08f'");
    expect(presentationSource).toContain('pattern: PHONE_PATTERN_TERMINAL_EDGE_SURFACE');
    expect(presentationSource).not.toContain('#8f7f61');
    expect(stageRailStyles).toContain('url("../../../../assets/hero-back.webp")');
    expect(stageRailStyles).toContain('url("../../../../assets/pattern-background.webp")');
    expect(stageRailStyles).toContain('[data-portrait-edge-scene="hero"]');
    expect(stageRailStyles).toContain('[data-portrait-edge-scene="pattern"]');
  });

  it('[P0 Figure2 coverage] continues the real middle scene through Safari dynamic viewport growth', () => {
    expect(stageRailStyles).toContain('[data-portrait-edge-scene="figure2"]');
    expect(stageRailStyles).toContain(
      'url("../../../../assets/figure2-continuation.svg")'
    );
    expect(stageRailStyles).toContain(
      'url("../../../../assets/figure2-middle-building.webp")'
    );
    expect(stageRailStyles).toContain('background-image: none;');
    expect(stageRailStyles).toContain(
      '.portrait-scroll-spike[data-portrait-edge-scene="figure2"] .portrait-scroll-spike__viewport-coverage::before'
    );
    expect(stageRailStyles).toContain(
      'fixed continuation texture extend below the authored seam'
    );
    expect(stageRailStyles).toContain(
      'var(--portrait-figure2-camera-width) var(--portrait-figure2-camera-height);'
    );
    // The cloud asset is portrait (941×1672). Its continuation must preserve
    // object-fit: cover rather than stretching the texture into the 46%×72%
    // layout box used by the authored camera.
    expect(stageRailStyles).toContain('1.776833');
    expect(stageRailStyles).not.toContain(
      'calc(var(--portrait-figure2-camera-height) * .72 * var(--portrait-figure2-cloud-scale, 1))'
    );
    expect(stageRailStyles).toContain('50% 0;');
    expect(stageRailStyles).toContain(
      'background-size: var(--portrait-figure2-camera-width) 256px;'
    );
    expect(stageRailStyles).not.toContain('background-size: 100% 100%');
    expect(stageRailStyles).not.toContain(
      'background-size: auto var(--portrait-figure2-overscan-height)'
    );
    expect(stageRailStyles).not.toContain(
      'background: #e2dac9 url("../../../../assets/figure2-middle-building.webp")'
    );
  });

  it('[P1 Figure2 coverage] reuses the authored middle camera origin, transform, and scale', () => {
    expect(stageRailStyles).toContain('--portrait-figure2-camera-scale');
    expect(stageRailStyles).toContain('--portrait-figure2-middle-y');
    const figure2Coverage = stageRailStyles.slice(
      stageRailStyles.indexOf('[data-portrait-edge-scene="figure2"]'),
      stageRailStyles.indexOf('/* Above-both effects are route siblings,')
    );
    expect(figure2Coverage).toContain('.portrait-scroll-spike__viewport-coverage::before');
    expect(figure2Coverage).toContain(
      '.portrait-scroll-spike__viewport-coverage::after'
    );
    expect(stageRailStyles).toContain(
      '.portrait-scroll-spike[data-portrait-edge-scene="figure2"] .portrait-scroll-spike__stage-canvas'
    );
    expect(stageRailStyles).toContain(
      '.portrait-scroll-spike[data-portrait-edge-scene="figure2"] .phone-grade-a__surfaces > .r4-figure2'
    );
    expect(stageRailStyles).toContain('background: transparent;');
    expect(stageRailStyles).toContain('--portrait-figure2-camera-width: max(100vw, calc(var(--portrait-stage-height) * 16 / 9));');
    expect(stageRailStyles).toContain('--portrait-figure2-camera-height: max(var(--portrait-stage-height), calc(100vw * 9 / 16));');
    expect(stageRailStyles).toContain('--portrait-figure2-camera-translate-y');
    expect(figure2Coverage).toContain('transform: translate3d(');
    expect(figure2Coverage).toContain('var(--portrait-figure2-camera-translate-y)');
    expect(figure2Coverage).toContain('scale(var(--portrait-figure2-camera-scale));');
    expect(figure2Coverage).toContain(
      'transform-origin: 50% calc(var(--portrait-figure2-camera-height) * .56);'
    );
    expect(figure2Coverage).toContain('height: var(--portrait-figure2-camera-height);');
    expect(figure2Coverage).toContain('aspect-ratio: 16 / 9;');
    expect(figure2Coverage).toContain(
      'var(--portrait-figure2-extension-local-height)'
    );
    expect(figure2Coverage).toContain(
      'top: calc(var(--portrait-stage-height) / 2);'
    );
    expect(figure2Coverage).toContain('left: 50vw;');
    expect(figure2Coverage).toContain(
      'var(--portrait-figure2-camera-width) var(--portrait-figure2-camera-height);'
    );
    expect(figure2Coverage).toContain(
      'var(--portrait-figure2-camera-height) * .5'
    );
    expect(figure2Coverage).toContain('50% 0;');
    expect(figure2Coverage).not.toContain(
      'background-position: 50% calc(50% + var(--portrait-figure2-far-arcade-y'
    );
  });

  it('[P1 Figure2 coverage] keeps the continuation in the exact camera coordinate box', () => {
    const figure2Coverage = stageRailStyles.slice(
      stageRailStyles.indexOf('[data-portrait-edge-scene="figure2"]'),
      stageRailStyles.indexOf('/* Above-both effects are route siblings,')
    );
    const camera = figure2Coverage.slice(
      figure2Coverage.indexOf('::before'),
      figure2Coverage.indexOf('}', figure2Coverage.indexOf('::before')) + 1
    );
    const continuation = figure2Coverage.slice(
      figure2Coverage.indexOf('.portrait-scroll-spike__viewport-coverage::after'),
      figure2Coverage.indexOf(
        '}',
        figure2Coverage.indexOf('.portrait-scroll-spike__viewport-coverage::after')
      ) + 1
    );
    const texture = continuation;
    expect(camera).toContain('background-position:');
    expect(continuation).toContain(
      'top: calc(var(--portrait-stage-height) / 2);'
    );
    expect(continuation).toContain('transform: translate3d(');
    expect(continuation).toContain('var(--portrait-figure2-camera-height)');
    expect(continuation).toContain(
      'var(--portrait-figure2-extension-local-height)'
    );
    expect(texture).toContain(
      'background-position: 50% var(--portrait-figure2-camera-height);'
    );
    expect(texture).toContain(
      'background-size: var(--portrait-figure2-camera-width) 256px;'
    );
    expect(texture).toContain(
      'transform-origin: 50% calc(var(--portrait-figure2-camera-height) * .56);'
    );
  });

  it('[P0 AOD coverage] keeps AOD flat and reserves paper treatment for Method', () => {
    const aod = stageRailStyles.slice(
      stageRailStyles.indexOf('[data-portrait-edge-scene="aod"]'),
      stageRailStyles.indexOf('[data-portrait-edge-scene="method"]')
    );
    const method = stageRailStyles.slice(
      stageRailStyles.indexOf('[data-portrait-edge-scene="method"]'),
      stageRailStyles.indexOf('/* Keep Figure2')
    );

    expect(aod).toContain('background: #ede4d2;');
    expect(aod).not.toContain('gradient');
    expect(method).toContain('radial-gradient');
    expect(method).toContain('linear-gradient');
  });

  it('[P0 Figure2 floor] fills the complete frozen stage before live coverage extends it', () => {
    const root = figure2Styles.slice(
      figure2Styles.indexOf('.phone-grade-a__surfaces > .r4-figure2 {'),
      figure2Styles.indexOf(
        '.portrait-scroll-spike__scene--figure2 .r4-figure2__middle-window'
      )
    );
    expect(root).toContain('width: 100%;');
    expect(root).toContain('height: 100%;');
    expect(root).toContain('min-height: 100%;');
  });

  it('[P0 Method→Figure2] never resurrects the scrolled-away Method intro as the forward ink source', () => {
    expect(methodStyles).toMatch(
      /data-phone-cursor="transition:method-figure2:0"[^{]*data-phone-transition-direction="1"[^{]*\.portrait-scroll-spike__method-bridge\s*[{][^}]*display:\s*none\s*!important[^}]*visibility:\s*hidden\s*!important/s
    );
  });

  it('extends the live opaque backing from the frozen layout origin without moving its camera', () => {
    const input = {
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: {
        offsetLeft: 12,
        offsetTop: 160,
        width: 375,
        height: 700
      }
    };
    const coverage = readPhoneCoverageViewport(input);

    expect(coverage).toMatchObject({
      right: 390,
      bottom: 860
    });
    expect(readPhoneLayoutViewport(input)).toMatchObject({
      width: 390,
      height: 844
    });
  });

  it('extends coverage monotonically for toolbar motion without refreshing layout', () => {
    const value = fixture();
    const layouts: Array<Readonly<{ width: number; height: number; revision: number }>> = [];
    const controller = createPhoneViewportCoverageController({
      root: value.root,
      windowRef: value.windowRef,
      documentRef: value.documentRef,
      onLayout: (_root, layout) => layouts.push(layout)
    });

    expect(layouts).toHaveLength(1);
    expect(value.values.get('--portrait-coverage-right')).toBe('390px');
    expect(value.values.get('--portrait-coverage-bottom')).toBe('844px');

    value.visualViewport.offsetLeft = 8;
    value.visualViewport.offsetTop = 160;
    value.visualViewport.height = 700;
    value.visualViewport.dispatchEvent(new Event('resize'));
    value.visualViewport.dispatchEvent(new Event('scroll'));

    expect(value.callbacks).toHaveLength(1);
    value.flushFrame();

    expect(layouts).toHaveLength(1);
    expect(value.root.dataset.phoneCoverageRevision).toBe('2');
    expect(value.values.get('--portrait-coverage-right')).toBe('398px');
    expect(value.values.get('--portrait-coverage-bottom')).toBe('860px');

    // Safari's toolbar can retract in the same layout revision. Retaining the
    // greatest opaque extent prevents a single-frame bottom seam while the
    // fixed stage and overlay remain in their frozen coordinate space.
    value.visualViewport.offsetLeft = 0;
    value.visualViewport.offsetTop = 0;
    value.visualViewport.height = 700;
    value.visualViewport.dispatchEvent(new Event('resize'));
    value.flushFrame();

    expect(layouts).toHaveLength(1);
    expect(value.root.dataset.phoneCoverageRevision).toBe('2');
    expect(value.values.get('--portrait-coverage-right')).toBe('398px');
    expect(value.values.get('--portrait-coverage-bottom')).toBe('860px');
    controller.dispose();
  });

  it('updates the layout camera only on width/orientation/fullscreen changes', () => {
    const value = fixture();
    const layouts: number[] = [];
    const controller = createPhoneViewportCoverageController({
      root: value.root,
      windowRef: value.windowRef,
      documentRef: value.documentRef,
      onLayout: (_root, layout) => layouts.push(layout.revision)
    });

    Object.assign(value.windowRef as unknown as {
      innerWidth: number;
      innerHeight: number;
    }, {
      innerWidth: 844,
      innerHeight: 390
    });
    value.visualViewport.width = 844;
    value.visualViewport.height = 390;
    value.visualViewport.dispatchEvent(new Event('resize'));
    value.flushFrame();
    expect(layouts).toEqual([1, 2]);

    value.documentRef.dispatchEvent(new Event('fullscreenchange'));
    value.flushFrame();
    expect(layouts).toEqual([1, 2, 3]);
    controller.dispose();
  });
});
