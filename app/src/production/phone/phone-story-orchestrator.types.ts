import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import type {
  PhoneStoryEvent,
  PhoneStoryReduction,
  PhoneStorySnapshot,
} from './phone-story-state';
import type {
  PhoneIntent,
  PhoneIntentDisposition,
  PhoneTransitionDirection,
  PhoneTransitionSession
} from './phone-transition-coordinator';
import type {
  PhoneStoryProjector,
  PhoneSurfaceRegistration
} from './phone-story-projector';
import type {
  PhonePresentationEvidenceKind,
  PhoneSurfaceId
} from './phone-presentation-contract';
import type {
  PhoneScrollCorridor,
  PhoneScrollCorridorLease,
  PhoneScrollCorridorRegistry
} from './phone-scroll-corridor-registry';

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
  /**
   * Only a renderer/compositor may publish this transition gate. The evidence
   * travels with the same event, so prepare cannot inherit a stale frame.
   */
  reportPresentedFrame(
    kind?: PhonePresentationEvidenceKind,
    subject?: PhoneSurfaceId
  ): void;
  /** Reports a typed frame/coverage/content fact for the active generation. */
  reportPresentationEvidence(
    kind: PhonePresentationEvidenceKind,
    subject: PhoneSurfaceId,
    observedAt?: number
  ): void;
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
  /** Commits a direct-entry receiver only after its post-alignment proof. */
  reportStablePresentationVerified(): void;
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
  subscribe(listener: () => void): PhoneCapabilityLease;
  syncDiagnostics(): void;
  registerRunCapability(
    run: PhoneRunId,
    ownerId: string,
    capability: PhoneRunCapability
  ): PhoneCapabilityLease;
  registerSurface(registration: PhoneSurfaceRegistration): PhoneCapabilityLease;
  registerScrollCorridor(corridor: PhoneScrollCorridor): PhoneScrollCorridorLease;
}>;

/** @deprecated Internal engine type; production components receive RuntimePort. */
export type PhoneStoryOrchestrator = PhoneStoryRuntimePort & Readonly<{
  /** Factory-only input ingress; route descendants receive RuntimePort instead. */
  resolveIntent(intent: PhoneIntent): PhoneIntentDisposition;
  /** Factory-only registry ingress for the single document scroll sampler. */
  scrollCorridors: PhoneScrollCorridorRegistry;
  dispose(): void;
}>;
