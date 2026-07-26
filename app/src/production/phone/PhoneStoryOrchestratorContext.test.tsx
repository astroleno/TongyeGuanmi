import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PhoneStoryOrchestratorProvider,
  usePhoneStoryOrchestrator,
  usePhoneStorySelector,
  usePhoneStorySnapshot
} from './PhoneStoryOrchestratorContext';
import { createPhoneStoryOrchestrator } from './phone-story-orchestrator';

function CursorProbe() {
  const orchestrator = usePhoneStoryOrchestrator();
  return <span>{orchestrator.cursor().kind}</span>;
}

function SnapshotProbe() {
  const snapshot = usePhoneStorySnapshot();
  const inputLocked = usePhoneStorySelector((current) => (
    current.status === 'transaction'
  ));
  return <span>{`${snapshot.status}:${inputLocked}`}</span>;
}

describe('PhoneStoryOrchestratorContext', () => {
  it('publishes one stable shell-owned orchestrator instance', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'hero',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    expect(renderToStaticMarkup(
      <PhoneStoryOrchestratorProvider orchestrator={orchestrator}>
        <CursorProbe />
      </PhoneStoryOrchestratorProvider>
    )).toContain('<span>hold</span>');
  });

  it('exposes the same canonical snapshot to selectors', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'hero',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    expect(renderToStaticMarkup(
      <PhoneStoryOrchestratorProvider orchestrator={orchestrator}>
        <SnapshotProbe />
      </PhoneStoryOrchestratorProvider>
    )).toContain('<span>stable:false</span>');
  });

  it('rejects capability registration outside the formal shell provider', () => {
    expect(() => renderToStaticMarkup(<CursorProbe />)).toThrow(
      'Phone story orchestrator is unavailable'
    );
  });
});
