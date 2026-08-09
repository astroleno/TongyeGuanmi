import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'usePhoneCinematicRun.ts'),
  'utf8'
);

describe('usePhoneCinematicRun execution token contract', () => {
  it('captures the token injected at adapter start and emits a raw frame only from its physical presented callback', () => {
    expect(source).toContain('activeIdentityRef');
    expect(source).toContain("import type { PhoneExecutionToken }");
    expect(source).toContain('options.reportFact([');
    expect(source).not.toContain('dispatchPhoneLabContactAutoplay');
    expect(source).not.toContain('CustomEvent');
    expect(source).toMatch(/identity\?\.\[5\]/);
    expect(source).toContain("phase === 'presented'");
    expect(source).toContain('frameSequence');
    expect(source).toContain('phoneRuntimePresentationTokenKey(identity[5])');
    expect(source).toContain('presentationKey !== phoneRuntimePresentationTokenKey');
    expect(source).toContain('presentPreparedFrame: (token: PresentationToken) => void');
    expect(source).toContain('reportFact: PhoneCinematicFactReporter');
    expect(source).not.toContain('identity?.authorityId');
    expect(source).toContain('renderProgress');
    expect(source).toContain('startRun = useCallback((');
  });

  it('[R5] redraws an already-prepared renderer only after its run token is active', () => {
    expect(source).toMatch(/presentPreparedFrame:\s*\(token: PresentationToken\) => void,/);
    expect(source).toContain('if (activeIdentity?.[5]) {');
    expect(source).toContain('options.presentPreparedFrame(activeIdentity[5]);');
    expect(source).toContain('reverseReady: (token: PresentationToken | null) => boolean');
    expect(source).toContain('options.reverseReady(token)');
  });

  it('[R5] leaves reverse timeout and rollback ownership to the route runner', () => {
    expect(source).not.toContain('setTimeout');
    expect(source).not.toContain('timerRef');
    expect(source).not.toContain('reverseTimeoutMs');
  });
});
