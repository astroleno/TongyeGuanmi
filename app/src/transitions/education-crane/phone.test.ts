import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHONE_EDUCATION_CRANE_OPTIONS } from './phone';

describe('Phone Education → Crane transition', () => {
  it('owns only the reviewed horizontal Ink field', () => {
    expect(PHONE_EDUCATION_CRANE_OPTIONS).toMatchObject({
      segmentId: 'education-crane', surfaceId: 'fx:education-crane', grade: 'edge-bright',
      field: { kind: 'horizontal', direction: 'bottom-to-top' }
    });
    const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/renderPhoneCrane|renderEducation|style\.opacity|inert/);
  });
});
