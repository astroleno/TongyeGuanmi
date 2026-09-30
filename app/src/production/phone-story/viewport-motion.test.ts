// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { phoneTtgFrame } from '../../scenes/ttg-animation/phone/PhoneTtg';
import { renderPhoneCranePresentation } from '../../scenes/crane-animation/phone/PhoneCrane.motion';
import { figure2DepthTransformForProgress } from '../../scenes/figure2-animation';

const viewports = [[390, 664], [390, 844], [1440, 900], [1440, 1080]] as const;
const samples = [0, .25, .5, .75, 1];

describe('authored motion across viewport heights', () => {
  it('keeps TTG parallax at the same vh position in forward and reverse sampling', () => {
    for (const progress of [...samples, ...[...samples].reverse()]) {
      const reference = phoneTtgFrame(progress, false, false, 100);
      for (const [, height] of viewports) {
        const frame = phoneTtgFrame(progress, false, false, height);
        for (const key of ['backgroundY', 'middleY', 'foregroundY', 'figureY'] as const) {
          expect(frame[key] / height * 100).toBeCloseTo(reference[key], 8);
        }
      }
    }
  });

  it('keeps Crane architecture exit aligned to the retained stage height', () => {
    const exits: number[][] = [];
    for (const [width, height] of viewports) {
      const root = document.createElement('section');
      root.dataset.r4Scene = 'crane-animation';
      root.innerHTML = '<div class="crane-layer--cloud-back"></div>';
      root.getBoundingClientRect = () => ({ width, height } as DOMRect);
      const layer = root.firstElementChild as HTMLElement;
      const values = [...samples, ...[...samples].reverse()].map((progress) => {
        renderPhoneCranePresentation(root, progress);
        return Number(layer.style.transform.match(/, ([\d.-]+)px/)![1]) / height;
      });
      exits.push(values);
      expect(values[0]).toBe(0);
      expect(values[4]).toBeCloseTo(1.38 * .82, 4);
    }
    for (const values of exits) values.forEach((value, index) => {
      expect(value).toBeCloseTo(exits[0]![index]!, 4);
    });
  });

  it('keeps Figure2 media and ink cover coordinates centered at both aspect ratios', () => {
    for (const [width, height] of viewports) {
      const root = document.createElement('section');
      root.getBoundingClientRect = () => ({ width, height } as DOMRect);
      for (const progress of [...samples, ...[...samples].reverse()]) {
        const { viewport, cover, camera } = figure2DepthTransformForProgress(root, progress);
        expect(viewport).toEqual({ width, height });
        expect(cover.width / cover.height).toBeCloseTo(16 / 9);
        expect(cover.width).toBeGreaterThanOrEqual(width);
        expect(cover.height).toBeGreaterThanOrEqual(height);
        expect(cover.x + cover.width / 2).toBeCloseTo(width / 2);
        expect(cover.y + cover.height / 2).toBeCloseTo(height / 2);
        expect(camera.originY).toBe(.56);
      }
    }
  });
});
