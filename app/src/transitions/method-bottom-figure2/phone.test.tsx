import { describe, expect, it } from 'vitest';
import {
  PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS,
  phoneMethodBottomFigure2Progress
} from './phone';

describe('clean Method → Figure2 transition leaf', () => {
  it('freezes the accepted bottom-up field and 0.8 ownership gate', () => {
    expect(PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS).toMatchObject({
      segmentId: 'method-bottom-figure2', surfaceId: 'fx:method-bottom-figure2',
      field: {
        kind: 'horizontal', direction: 'bottom-to-top',
        seed: 'method-bottom-figure2-phone'
      }, grade: 'dark'
    });
    expect(phoneMethodBottomFigure2Progress(.4)).toBe(.5);
    expect(phoneMethodBottomFigure2Progress(.8)).toBe(1);
    expect(phoneMethodBottomFigure2Progress(1)).toBe(1);
  });
});
