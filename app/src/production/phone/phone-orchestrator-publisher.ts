import type { SceneId } from '../../story/types';
import {
  phoneStoryPresentation,
  type PhonePresentationEvidence
} from './phone-story-presentation';
import type { PhoneStoryCursor } from './phone-story-state';

type PublisherOptions = Readonly<{
  root?: HTMLElement | (() => HTMLElement | null) | undefined;
  onCursor?: ((cursor: PhoneStoryCursor) => void) | undefined;
  onPresentation?: ((evidence: PhonePresentationEvidence) => void) | undefined;
  onLockChange?: ((locked: boolean) => void) | undefined;
  presentationSceneIsCurrent(scene: SceneId): boolean;
}>;

export function createPhoneOrchestratorPublisher(options: PublisherOptions) {
  let lastPresentation = '';
  const root = () => typeof options.root === 'function'
    ? options.root()
    : options.root;
  const presentation = (evidence: PhonePresentationEvidence) => {
    if (
      evidence.scene
      && !options.presentationSceneIsCurrent(evidence.scene)
    ) return;
    const identity = `${evidence.scene}/${evidence.checkpoint}/${evidence.edge}`;
    if (identity === lastPresentation) return;
    lastPresentation = identity;
    options.onPresentation?.(evidence);
  };
  const cursor = (
    next: PhoneStoryCursor,
    publishHoldPresentation = true
  ) => {
    const element = root();
    if (element) {
      // The fixed stage remains the document's visual owner for the complete
      // phone story. ScrollTrigger may still sample its historical rail while
      // a later adapter owns a committed hold, so it must never be allowed to
      // turn the stage off from stale geometry. Cursor publication is the
      // single authority for that surface contract.
      element.dataset.portraitStageActive = 'true';
      // The AOD adapter may animate the Method copy during its own active
      // run, but only a committed hold may select which stable copy owns the
      // viewport. This also prevents the completed Method bridge from sitting
      // above Figure2 after the next run has landed.
      if (next.kind === 'hold') {
        element.dataset.portraitAodMethodVisible = next.scene === 'method-top' ? 'true' : 'false';
      }
      element.dataset.phoneCursor = next.kind === 'hold'
        ? `hold:${next.scene}`
        : `transition:${next.run}:${next.legIndex}`;
      if (next.kind === 'transition') {
        element.dataset.phoneSession = next.sessionId;
        element.dataset.phoneSegment = next.segment;
        element.dataset.phoneTransitionPhase = next.phase;
      } else {
        delete element.dataset.phoneSession;
        delete element.dataset.phoneSegment;
        delete element.dataset.phoneTransitionPhase;
      }
    }
    options.onCursor?.(next);
    if (publishHoldPresentation) presentation(phoneStoryPresentation(next));
  };
  const lock = (locked: boolean) => {
    const element = root();
    if (element) {
      if (locked) element.dataset.phoneTransitionLock = 'locked';
      else delete element.dataset.phoneTransitionLock;
    }
    options.onLockChange?.(locked);
  };
  const anchor = (anchorY?: number) => {
    const element = root();
    if (!element) return;
    if (anchorY === undefined) delete element.dataset.phoneAnchorY;
    else element.dataset.phoneAnchorY = String(Math.round(anchorY));
  };
  return { presentation, cursor, lock, anchor };
}
