import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIGURE2_INTRO_END } from '../../../transitions/figure2-distance-expand';
import {
  alignPhoneProofBrandReceiver,
  PHONE_PROOF_BRAND_FIELD
} from './figure2-proof-brand';
import {
  phoneFigure2ProofTimelineProgress
} from './figure2-distance-expand';
import { PHONE_METHOD_FIGURE2_FIELD } from './method-bottom-figure2';
import {
  phoneInkAdapterProgress,
  phoneInkFirstPresentationProgress
} from './PhoneInkTransition';
import { canonicalPhoneEffectSegment } from '../phone-story/presentation';
import { phoneSegmentPresentationTuple } from '../phone-story/manifest';

const inkAdapterSource = readFileSync(
  new URL('./PhoneInkTransition.tsx', import.meta.url),
  'utf8'
);
const figure2DistanceSource = readFileSync(
  new URL('./figure2-distance-expand.tsx', import.meta.url),
  'utf8'
);
const gradeAStorySource = readFileSync(
  new URL('../PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);
const labContactContinuationSource = readFileSync(
  new URL('../PhoneLabContactContinuation.tsx', import.meta.url),
  'utf8'
);
const brandLabCss = readFileSync(
  new URL('../PhoneBrandLabStory.css', import.meta.url),
  'utf8'
);

class FakeStyle {
  readonly values = new Map<string, string>();
  width = '';
  height = '';

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  parentElement: FakeElement | null = null;
  textContent = '';

  constructor(
    readonly ownerDocument: FakeDocument,
    private readonly rect = {
      top: 0,
      left: 0,
      width: 0,
      height: 0
    }
  ) {}

  append(element: FakeElement): void {
    element.parentElement = this;
    this.children.push(element);
  }

  insertBefore(element: FakeElement, reference: FakeElement): void {
    const index = this.children.indexOf(reference);
    element.parentElement = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, element);
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  getBoundingClientRect() {
    return { ...this.rect, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'style') this.style.values.clear();
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

describe('phone Grade A transition contracts', () => {
  it('uses the route-overlay-only ink adapter only for above-both contracts', () => {
    const inkIds = [
      'portrait-hero-pattern-ink',
      'portrait-pattern-star-ink',
      'portrait-star-aod-ink',
      'phone-method-bottom-figure2',
      'phone-figure2-proof-brand',
      'phone-brand-figure3',
      'phone-services-ttg',
      'phone-lab-ph-ink',
      'phone-education-crane-ink'
    ];
    for (const id of inkIds) {
      const segment = canonicalPhoneEffectSegment(id);
      expect(segment).toBeDefined();
      expect(phoneSegmentPresentationTuple(segment!)[10]).toBe('route-overlay');
    }
    expect(inkAdapterSource).toContain(
      'const effectHost = phoneRouteOverlayHostFor(contentHost);'
    );
    expect(inkAdapterSource).not.toContain('phoneInkEffectHostPlane');
  });

  it('passes the canonical content host to every route-overlay adapter', () => {
    expect(gradeAStorySource.match(/host=\{stageHost\}/g)).toHaveLength(3);
    expect(gradeAStorySource).not.toContain('host={surfacesRef.current}');
    expect(labContactContinuationSource.match(/host=\{stageHost\}/g)).toHaveLength(4);
    expect(labContactContinuationSource).not.toContain('host={phStageRef.current}');
    expect(labContactContinuationSource).not.toContain('host={craneStageRef.current}');
  });

  it('keeps Figure2 distance expansion in the route overlay host', () => {
    expect(phoneSegmentPresentationTuple('figure2-distance-expand')[10]).toBe(
      'route-overlay'
    );
    expect(figure2DistanceSource).toContain(
      'const effectHost = phoneRouteOverlayHostFor(contentHost);'
    );
    expect(figure2DistanceSource).not.toContain('phoneSegmentPresentationTuple');
  });

  it('keeps both chapter boundaries on the canonical bottom-up field', () => {
    expect(PHONE_METHOD_FIGURE2_FIELD).toEqual([
      'horizontal',
      expect.any(String),
      'bottom-to-top',
      null,
      null
    ]);
    expect(PHONE_PROOF_BRAND_FIELD).toEqual([
      'horizontal',
      expect.any(String),
      'bottom-to-top',
      null,
      null
    ]);
  });

  it('keeps the authored Figure2 media/depth split', () => {
    expect(FIGURE2_INTRO_END).toBe(0.72);
    expect(phoneFigure2ProofTimelineProgress(0)).toBe(0.72);
    expect(phoneFigure2ProofTimelineProgress(0.5)).toBe(0.86);
    expect(phoneFigure2ProofTimelineProgress(1)).toBe(1);
  });

  it('[Method→Figure2→Proof execution cutover] sends canonical progress only to the Ink bridge', () => {
    expect(figure2DistanceSource).toContain("timeline(['render', sampled]);");
    expect(figure2DistanceSource).not.toContain('fallbackFrame(');
    expect(figure2DistanceSource).not.toContain('renderFigure2AnimationProgress');
    expect(figure2DistanceSource).not.toContain('figure2IntroProgress(');
  });

  it('keeps Proof visible until reduced-motion Brand boundary entry', () => {
    expect(phoneInkAdapterProgress(0, true, 'boundary')).toBe(0);
    expect(phoneInkAdapterProgress(0.001, true, 'boundary')).toBe(1);
    expect(phoneInkAdapterProgress(0, true, 'receiver')).toBe(1);
    expect(phoneInkAdapterProgress(0.42, false, 'boundary')).toBe(0.42);
  });

  it('[R5] samples the first proof frame inside the visibly composited ink interval', () => {
    // The WebGL field fades in through 0.06 and begins fading out at 0.94.
    // A lifecycle callback at either endpoint is renderer activity, not an
    // actual presentation proof.
    expect(phoneInkFirstPresentationProgress(1)).toBe(0.02);
    expect(phoneInkFirstPresentationProgress(-1)).toBe(0.92);
  });

  it('[R5] retries only an actual in-between renderer frame until its token can be proven', () => {
    expect(inkAdapterSource).toContain('const scheduleFirstFrameRetry = useCallback');
    expect(inkAdapterSource).toContain(
      'render(progress, true) || !presentedFrameRef.current'
    );
    expect(inkAdapterSource).toContain(
      'window.requestAnimationFrame(\n          renderUntilPresented\n        )'
    );
    expect(inkAdapterSource).toContain('scheduleFirstFrameRetry(direction);');
  });

  it('aligns only the forward receiver and preserves the reverse source', () => {
    expect(inkAdapterSource).toMatch(
      /enter\(\) \{\s*directionRef\.current = 1;\s*alignReceiver\(1\);\s*\}/
    );
    expect(inkAdapterSource).toMatch(
      /reverse\(\) \{\s*directionRef\.current = -1;\s*releaseReceiver\(\);\s*\}/
    );
    expect(brandLabCss).toContain('var(--phone-proof-brand-align-y)');
    expect(brandLabCss).not.toContain('--phone-flow-endpoint-align-y');
  });

  it('aligns the one canonical Brand receiver only for the ink run', () => {
    const document = new FakeDocument();
    const parent = new FakeElement(document);
    const host = new FakeElement(document, {
      top: 14,
      left: 0,
      width: 390,
      height: 844
    });
    const receiver = new FakeElement(document, {
      top: 844,
      left: 0,
      width: 390,
      height: 1260
    });
    receiver.textContent = 'Brand canonical copy';
    receiver.setAttribute('style', 'color: #292919');
    parent.append(receiver);

    const release = alignPhoneProofBrandReceiver(
      host as unknown as HTMLElement,
      receiver as unknown as HTMLElement
    );

    expect(parent.children).toEqual([receiver]);
    expect(receiver.textContent).toBe('Brand canonical copy');
    expect(receiver.dataset.phoneProofBrandAligned).toBe('true');
    expect(receiver.style.getPropertyValue('--phone-proof-brand-align-x')).toBe('0px');
    expect(receiver.style.getPropertyValue('--phone-proof-brand-align-y')).toBe('-830px');

    release();

    expect(parent.children).toEqual([receiver]);
    expect(receiver.dataset.phoneProofBrandAligned).toBeUndefined();
    expect(receiver.style.getPropertyValue('--phone-proof-brand-align-x')).toBe('');
    expect(receiver.style.getPropertyValue('--phone-proof-brand-align-y')).toBe('');
    expect(receiver.getAttribute('style')).toBe('color: #292919');
  });
});
