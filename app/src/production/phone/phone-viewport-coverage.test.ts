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
const presentationSource = readFileSync(
  new URL('./phone-story/presentation.ts', import.meta.url),
  'utf8'
);
const patternStyles = readFileSync(
  new URL('./scenes/PhonePattern.css', import.meta.url),
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
  it('[front-half gate] makes the registered stage canvas an opaque live backing, not a transparent geometry-only proxy', () => {
    const stageCanvas = stageRailStyles.slice(
      stageRailStyles.indexOf('.portrait-scroll-spike__stage-canvas {'),
      stageRailStyles.indexOf('/* The fixed stage warms from mount')
    );

    expect(stageCanvas).toContain('height: max(100%, var(--portrait-stage-canvas-height));');
    expect(stageCanvas).toContain('background: var(--portrait-edge-surface);');
    expect(stageCanvas).not.toContain('background: transparent;');
  });

  it('[front-half gate] uses Pattern’s actual painted backing color for the route coverage plane', () => {
    expect(patternStyles).toContain('background: #d9c08f;');
    expect(presentationSource).toContain("PHONE_PATTERN_TERMINAL_EDGE_SURFACE = '#d9c08f'");
    expect(presentationSource).toContain('pattern: PHONE_PATTERN_TERMINAL_EDGE_SURFACE');
    expect(presentationSource).not.toContain('#8f7f61');
  });

  it('separates the live four-edge coverage plane from the frozen layout viewport', () => {
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
      left: 12,
      top: 160,
      right: 387,
      bottom: 860,
      width: 375,
      height: 700
    });
    expect(readPhoneLayoutViewport(coverage)).toMatchObject({
      width: 375,
      height: 700
    });
  });

  it('coalesces visual viewport changes into one coverage revision without refreshing layout', () => {
    const value = fixture();
    const layouts: Array<Readonly<{ width: number; height: number; revision: number }>> = [];
    const controller = createPhoneViewportCoverageController({
      root: value.root,
      windowRef: value.windowRef,
      documentRef: value.documentRef,
      onLayout: (_root, layout) => layouts.push(layout)
    });

    expect(layouts).toHaveLength(1);
    expect(value.values.get('--portrait-coverage-left')).toBe('0px');
    expect(value.values.get('--portrait-coverage-top')).toBe('0px');
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
    expect(value.values.get('--portrait-coverage-left')).toBe('8px');
    expect(value.values.get('--portrait-coverage-top')).toBe('160px');
    expect(value.values.get('--portrait-coverage-right')).toBe('398px');
    expect(value.values.get('--portrait-coverage-bottom')).toBe('860px');
    expect(value.values.get('--portrait-coverage-height')).toBe('700px');
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
