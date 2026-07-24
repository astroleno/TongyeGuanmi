import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneGroup67RunIsReady,
  phoneGroup67RunTarget
} from './PhoneLabContactContinuation';

const source = readFileSync(
  new URL('./PhoneLabContactContinuation.tsx', import.meta.url),
  'utf8'
);

describe('PhoneLabContactContinuation recovery contract', () => {
  it('waits for every scene and transition adapter required by the run', () => {
    expect(phoneGroup67RunIsReady('ph-animation', false, {
      labBoundary: true,
      ph: true,
      education: true,
      crane: false,
      contact: false,
      labPh: true,
      phEducation: true,
      educationCrane: false,
      craneContact: false
    })).toBe(true);
    expect(phoneGroup67RunIsReady('ph-animation', false, {
      labBoundary: true,
      ph: true,
      education: true,
      crane: false,
      contact: false,
      labPh: true,
      phEducation: false,
      educationCrane: false,
      craneContact: false
    })).toBe(false);
    expect(phoneGroup67RunIsReady('crane-animation', false, {
      labBoundary: false,
      ph: false,
      education: true,
      crane: true,
      contact: true,
      labPh: false,
      phEducation: false,
      educationCrane: true,
      craneContact: true
    })).toBe(true);
  });

  it('commits only the authored endpoint for a successful direction', () => {
    expect(phoneGroup67RunTarget('ph-animation', 1)).toBe('education');
    expect(phoneGroup67RunTarget('ph-animation', -1)).toBe('lab');
    expect(phoneGroup67RunTarget('crane-animation', 1)).toBe('contact');
    expect(phoneGroup67RunTarget('crane-animation', -1)).toBe('education');
  });

  it('requires target presentation and keeps failures retryable', () => {
    expect(source).toContain('runPhoneTargetPreparation');
    expect(source).toContain("detail.phase === 'failed'");
    expect(source).toContain("'retryable'");
    expect(source).not.toContain("'media-failure'");
    expect(source).not.toContain('phoneGroup67MediaFallback');
  });
});
