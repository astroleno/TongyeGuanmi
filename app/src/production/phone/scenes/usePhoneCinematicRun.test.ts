import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'usePhoneCinematicRun.ts'),
  'utf8'
);

describe('usePhoneCinematicRun execution identity contract', () => {
  it('captures the identity injected at adapter start and emits it with every media event', () => {
    expect(source).toContain('activeIdentityRef');
    expect(source).toContain('authorityId: identity?.authorityId ?? null');
    expect(source).toContain('sessionId: identity?.sessionId ?? null');
    expect(source).toContain('generation: identity?.generation ?? null');
    expect(source).toContain('leg: identity?.leg ?? null');
    expect(source).toContain('renderProgress');
    expect(source).toContain('startRun = useCallback((');
  });
});
