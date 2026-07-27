import type { SceneId } from '../../story/types';
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
import type {
  PhoneStoryProjector,
  PhoneSurfaceRegistration
} from './phone-story-projector';
import type { PhoneStageSceneId } from './types';

export type { PhoneSurfaceRegistration } from './phone-story-projector';

export type PhoneReleaseLease = Readonly<{
  /** Clears masks/alignment before the landing measurement changes layout. */
  releaseGeometry(): void;
  /** Releases media/timers only after the stable snapshot is observable. */
  releaseResources(): void;
}>;

export type PhoneOrchestratedRunSession = PhoneTransitionSession & Readonly<{
  authorityId: string;
  sessionId: string;
  generation: number;
  leg: number;
  direction: PhoneTransitionDirection;
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
  reportEndpoints(source: HTMLElement, receiver: HTMLElement): void;
  reportEndpointCommit(endpoint: 'source' | 'receiver'): void;
  /** Confirms that the terminal receiver is connected and visibly presented. */
  reportTargetPresented(): void;
  reportEndpointRelease(): void;
  /** Supplies lifecycle-separated cleanup; the controller chooses each phase. */
  provideRelease(lease: PhoneReleaseLease): void;
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

export type PhoneStoryOrchestratorOptions = Readonly<{
  initialScene: SceneId;
  authorityId?: string;
  root?: HTMLElement | (() => HTMLElement | null);
  scrollY: () => number;
  scrollTo: (y: number) => void;
  projector?: PhoneStoryProjector;
  scheduleFrame?: (callback: () => void) => void;
}>;

/** Context-safe authority facade. It intentionally omits attach()/dispose(). */
export type PhoneStoryRuntimePort = Readonly<{
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
  registerRunCapability(
    run: PhoneRunId,
    ownerId: string,
    capability: PhoneRunCapability
  ): PhoneCapabilityLease;
  registerSurface(registration: PhoneSurfaceRegistration): PhoneCapabilityLease;
  /** @deprecated Removed with the input/direct-entry migration in Task 3. */
  activateDirectEntry(): void;
  /** @deprecated Removed with the input/direct-entry migration in Task 3. */
  requestRun(direction: PhoneTransitionDirection): boolean;
  /** @deprecated Removed with the input/direct-entry migration in Task 3. */
  handleIntent(intent: PhoneIntent): boolean;
  /** @deprecated Removed with the document sampler migration in Task 3. */
  reconcileHold(scene: SceneId): void;
  /** @deprecated Removed with the document sampler migration in Task 3. */
  reconcileScrollHold(scene: PhoneStageSceneId): void;
  /** @deprecated Removed with the document sampler migration in Task 3. */
  reconcileScrollRun(
    run: PhoneScrollRunId,
    direction: PhoneTransitionDirection,
    progress: number
  ): void;
}>;

/** @deprecated Internal engine type; production components receive RuntimePort. */
export type PhoneStoryOrchestrator = PhoneStoryRuntimePort & Readonly<{
  dispose(): void;
}>;
