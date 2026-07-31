import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PhoneStoryRuntimeProvider,
  usePhoneStoryRuntimePort,
  usePhoneStorySelector,
  usePhoneStorySnapshot
} from './PhoneStoryRuntimeContext';
import { createPhoneStoryRuntime } from './phone-story/runtime';

function SnapshotKindProbe() {
  const runtime = usePhoneStoryRuntimePort();
  const snapshot = runtime.getSnapshot();
  return <span>{snapshot.status === 'stable' ? 'hold' : 'transition'}</span>;
}

function SnapshotProbe() {
  const snapshot = usePhoneStorySnapshot();
  const inputLocked = usePhoneStorySelector((current) => (
    current.status === 'transaction'
  ));
  return <span>{`${snapshot.status}:${inputLocked}`}</span>;
}

describe('PhoneStoryRuntimeContext', () => {
  it('publishes one stable shell-owned runtime port without lifecycle methods', () => {
    const authority = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'hero',
      root: () => null,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    expect(renderToStaticMarkup(
      <PhoneStoryRuntimeProvider authority={authority}>
        <SnapshotKindProbe />
      </PhoneStoryRuntimeProvider>
    )).toContain('<span>hold</span>');
  });

  it('exposes the same canonical snapshot to selectors', () => {
    const authority = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'hero',
      root: () => null,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    expect(renderToStaticMarkup(
      <PhoneStoryRuntimeProvider authority={authority}>
        <SnapshotProbe />
      </PhoneStoryRuntimeProvider>
    )).toContain('<span>stable:false</span>');
  });

  it('rejects capability registration outside the formal shell provider', () => {
    expect(() => renderToStaticMarkup(<SnapshotKindProbe />)).toThrow(
      'Phone story runtime is unavailable'
    );
  });
});
