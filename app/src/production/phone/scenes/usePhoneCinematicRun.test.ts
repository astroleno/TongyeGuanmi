import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'usePhoneCinematicRun.ts'),
  'utf8'
);

describe('usePhoneCinematicRun execution token contract', () => {
  it('captures the token injected at adapter start and emits it with every media event', () => {
    expect(source).toContain('activeIdentityRef');
    expect(source).toContain("import type { PhoneExecutionToken }");
    expect(source).toMatch(
      /dispatchPhoneLabContactAutoplay\(options\.rootRef\.current, \[\s*options\.scene,\s*phase,\s*direction,\s*identity,\s*progress \?\? null\s*\]\)/
    );
    expect(source).not.toContain('identity?.authorityId');
    expect(source).toContain('renderProgress');
    expect(source).toContain('startRun = useCallback((');
  });
});
