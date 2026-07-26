import {
  useEffect,
  useState,
  type RefObject
} from 'react';
import type { SceneId } from '../../story/types';
import {
  createPhoneStoryOrchestrator,
  type PhonePresentationEvidence,
  type PhoneStoryOrchestrator
} from './phone-story-orchestrator';
import {
  createPhoneIntentCoordinator
} from './phone-transition-coordinator';

export function usePhoneStoryOrchestratorRuntime({
  initialScene,
  rootRef,
  onPresentation,
  onRetryable
}: Readonly<{
  initialScene: SceneId;
  rootRef: RefObject<HTMLElement | null>;
  onPresentation(evidence: PhonePresentationEvidence): void;
  onRetryable(run: string): void;
}>): PhoneStoryOrchestrator {
  const [orchestrator] = useState(() => createPhoneStoryOrchestrator({
    initialScene,
    root: () => rootRef.current,
    scrollY: () => window.scrollY,
    scrollTo: (y) => window.scrollTo(0, y),
    onPresentation,
    onRetryable
  }));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    orchestrator.syncDiagnostics();
    return createPhoneIntentCoordinator(
      root,
      (intent) => orchestrator.handleIntent(intent)
    ).dispose;
  }, [orchestrator, rootRef]);

  return orchestrator;
}
