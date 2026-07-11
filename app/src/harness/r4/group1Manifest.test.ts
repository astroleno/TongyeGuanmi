import { describe, expect, it } from 'vitest';
import { scrubDriveDurationMs } from './Group1Harness';
import { createR4Group1Manifest } from './group1Manifest';

describe('R4 group1 harness manifest', () => {
  it('preserves the real staged hero-pattern policy while keeping star-map scrubbable', () => {
    const manifest = createR4Group1Manifest('group1');
    const segments = manifest.nodes.filter((node) => node.kind === 'segment');

    expect(segments[0]).toMatchObject({
      id: 'hero-pattern',
      policy: { kind: 'stagedSnap', stops: [0.58], playMs: [2200, 1800] }
    });
    expect(segments[1]).toMatchObject({
      id: 'pattern-star-map',
      policy: { kind: 'scrub' },
      virtualDuration: 1800
    });
  });

  it('drives the Pattern to Star scrub from its short manifest duration', () => {
    expect(scrubDriveDurationMs(1800, 1)).toBe(1800);
    expect(scrubDriveDurationMs(1800, 0.5)).toBe(900);
  });
});
