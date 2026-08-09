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
    const stageCanvas = stageRailStyles.slice(
      stageRailStyles.indexOf('.portrait-scroll-spike__stage-canvas {'),
      stageRailStyles.indexOf('/* The fixed stage warms from mount')
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
      'url("../../../../assets/figure2-middle-building.webp")'
    );
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
