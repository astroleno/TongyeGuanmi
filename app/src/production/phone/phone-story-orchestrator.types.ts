import type { SceneId } from '../../story/types';
import type { PhonePresentationEvidence } from './phone-story-presentation';
import type {
  PhoneRunId,
  PhoneScrollRunId
} from './phone-story-runs';
import type {
  PhoneStoryCursor,
  PhoneStoryEvent,
  PhoneStoryReduction,
  PhoneStorySnapshot,
} from './phone-story-state';
import type {
  PhoneIntent,
  PhoneTransitionDirection,
  PhoneTransitionSession
} from './phone-transition-coordinator';
import type { PhoneSurfaceRoleElement } from './phone-surface-roles';
import type { PhoneStageSceneId } from './types';

export type PhoneOrchestratedRunSession = PhoneTransitionSession & Readonly<{
  sessionId: string;
  generation: number;
  reportPresentedFrame(): void;
  reportProgress(progress: number): void;
  /** Controller-owned clock: invokes the adapter's passive render callback. */
  animate(
    start: number,
    end: number,
    durationMs: number | undefined,
    render: (progress: number) => void,
    complete: () => void
  ): void;
  reportEndpoints(
    source: PhoneSurfaceRoleElement,
    receiver: PhoneSurfaceRoleElement
  ): void;
  reportEndpointCommit(endpoint: 'source' | 'receiver'): void;
  reportEndpointRelease(): void;
  /** Supplies passive resource cleanup; the controller chooses when to call it. */
  provideRelease(release: () => void): void;
  /** Reports a rendered terminal endpoint; the controller owns the commit. */
  reportAnimationComplete(): void;
  reportFailure(): void;
}>;

export type PhoneRunCapability = Readonly<{
  position(direction: PhoneTransitionDirection): number | null;
  canStart(direction: PhoneTransitionDirection): boolean;
  start(
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ): boolean | void;
  startAtLeg?(
    legIndex: number,
    session: PhoneOrchestratedRunSession
  ): boolean | void;
}>;

export type PhoneCapabilityLease = Readonly<{ dispose(): void }>;

/** Passive scene-local commit invoked only after the Orchestrator chooses a hold. */
export type PhoneStableSceneAdapter = Readonly<{
  root(): PhoneSurfaceRoleElement | null;
  commit(): void;
}>;

export type PhoneStoryOrchestratorOptions = Readonly<{
  initialScene: SceneId;
  root?: HTMLElement | (() => HTMLElement | null);
  scrollY: () => number;
  scrollTo: (y: number) => void;
  onPresentation?: (evidence: PhonePresentationEvidence) => void;
  onRetryable?: (run: PhoneRunId) => void;
  scheduleFrame?: (callback: () => void) => void;
}>;

export type PhoneStoryOrchestrator = Readonly<{
  /** Canonical external-store read model. */
  getSnapshot(): PhoneStorySnapshot;
  /**
   * The only state mutation entrance. Browser and adapter callbacks are
   * normalized to PhoneStoryEvent before they reach this method.
   */
  dispatch(event: PhoneStoryEvent): PhoneStoryReduction;
  /** @deprecated Use getSnapshot() plus selectors instead. */
  cursor(): PhoneStoryCursor;
  subscribe(listener: () => void): PhoneCapabilityLease;
  syncDiagnostics(): void;
  activateDirectEntry(): void;
  requestRun(direction: PhoneTransitionDirection): boolean;
  handleIntent(intent: PhoneIntent): boolean;
  reconcileHold(scene: SceneId): void;
  reconcileScrollHold(scene: PhoneStageSceneId): void;
  reconcileScrollRun(
    run: PhoneScrollRunId,
    direction: PhoneTransitionDirection,
    progress: number
  ): void;
  registerRunCapability(
    run: PhoneRunId,
    ownerId: string,
    capability: PhoneRunCapability
  ): PhoneCapabilityLease;
  registerStableSceneAdapter(
    scene: SceneId,
    ownerId: string,
    adapter: PhoneStableSceneAdapter
  ): PhoneCapabilityLease;
  dispose(): void;
}>;
