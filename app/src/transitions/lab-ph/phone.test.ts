import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHONE_LAB_PH_OPTIONS } from './phone';

describe('Phone Lab → PH transition', () => {
  it('owns only the reviewed horizontal Ink field', () => {
    expect(PHONE_LAB_PH_OPTIONS).toMatchObject({
      segmentId: 'lab-ph', surfaceId: 'fx:lab-ph', grade: 'edge-bright',
      field: { kind: 'horizontal', direction: 'bottom-to-top' }
    });
    const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/renderPhonePh|style\.opacity|inert/);
  });
});
