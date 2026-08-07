import type { SceneId } from '../../../../story/types';
import type { PhoneRunId } from '../../phone-story-runs';
import type {
  PhoneAodRunnerStage,
  PhoneStoryEvent,
  PhoneStoryReduction,
  PhoneStorySnapshot,
  PhoneFailureReason,
  PhoneTransactionPhase,
  PresentationProof,
  PresentationReadiness,
  PresentationToken
} from '../machine';
import type {
  PhoneIntent,
  PhoneIntentDisposition,
  PhoneTransitionDirection,
  PhoneTransitionSession
} from '../../phone-transition-coordinator';
import type {
  PhoneEffectRegistration,
  PhoneRenderedPresentationFrame,
  PhoneStoryPresentation,
  PhoneSurfaceRegistration
} from '../presentation';
import type {
  PhonePresentationProofKind,
  PhoneSurfaceId
} from '../manifest';
import type {
  PhoneScrollCorridor,
  PhoneScrollCorridorLease,
  PhoneScrollCorridorRegistry
} from '../../phone-scroll-corridor-registry';

export type { PhoneSurfaceRegistration } from '../presentation';

/**
 * Renderer-local opaque key derived from a complete immutable proof token.
 * The reducer never parses it; leaves retain the original object token for
 * every proof callback.
 */
export function phoneRuntimePresentationTokenKey(token: PresentationToken): string {
  return [
    token.authorityId,
    token.sessionId ?? '',
    token.generation,
    token.leg ?? '',
    token.revision,
    token.subject,
    token.kind
  ].map((part) => encodeURIComponent(String(part))).join('|');
}

export type PhoneReleaseLease = Readonly<{
  /** Clears masks/alignment before the landing measurement changes layout. */
  releaseGeometry(): void;
  /** Releases media/timers only after the stable snapshot is observable. */
  releaseResources(): void;
}>;

/** Immutable positional identity passed directly to the packed-canvas leaf. */
export type PhoneAodExecution = readonly [
  token: PresentationToken,
  direction: PhoneTransitionDirection
];

export type PhoneOrchestratedRunSession = PhoneTransitionSession & Readonly<{
  authorityId: string;
  sessionId: string;
  generation: number;
  leg: number;
  direction: PhoneTransitionDirection;
  /**
   * A leaf forwards the complete immutable frame it actually painted. The
   * runtime validates that evidence, but never recreates its token.
   */
  reportPresentationFrame(frame: PhoneRenderedPresentationFrame): boolean;
  /** The only runtime ingress for a renderer-owned token-bound proof. */
  /** Returns false when the reducer rejected the proof in its current phase. */
  reportPresentationProof(proof: PresentationProof): boolean;
  /** Candidate coverage can release layout but can never publish stable. */
  reportPresentationReadiness(readiness: PresentationReadiness): void;
  /** Returns the immutable object token required by presentation adapters. */
  presentationProofToken(
    kind: PhonePresentationProofKind,
    subject: PhoneSurfaceId
  ): PresentationToken | null;
  /**
   * Raw-frame admission token for hard-cutover leaves. It deliberately has a
   * separate name from the legacy proof helper so lazy runners cannot turn a
   * callback into a synthetic proof.
   */
  presentationFrameToken(
    kind: PhonePresentationProofKind,
    subject: PhoneSurfaceId
  ): PresentationToken | null;
  /**
   * Candidate-only layout request for reduced motion. The route runtime owns
   * the physical scroll and rejects stale or non-reduced transactions.
   */
  requestReducedTargetLayout(targetY: number): boolean;
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
  /** The runtime commits only after a current, token-bound target proof. */
  reportPresentationCommitted(): void;
  reportEndpointRelease(): void;
  /** Supplies lifecycle-separated cleanup; the controller chooses each phase. */
  provideRelease(lease: PhoneReleaseLease): void;
  /** Reports a rendered terminal endpoint; the controller owns the commit. */
  reportAnimationComplete(): void;
  reportFailure(reason?: PhoneFailureReason): void;
}>;

/** AOD has no private event ingress; it uses the common session owner. */
export type PhoneAodRunSession = PhoneOrchestratedRunSession & Readonly<{
  /** AOD facts are reducer events; no runtime or leaf latch may join them. */
  reportAodPlayConfirmed(): boolean;
  reportAodFirstFrame(frame: PhoneRenderedPresentationFrame): boolean;
  reportAodProgress(progress: number): boolean;
  reportAodCompleted(): boolean;
  reportAodFailure(reason: PhoneFailureReason): boolean;
}>;

/**
 * Compact, read-only AOD observability transport.  It crosses from the
 * runtime chunk to the shell without exposing the mutable reducer lifecycle
 * record itself to a second presentation writer.
 */
export type PhoneAodDiagnostics = readonly [
  execution: string | null,
  phase: PhoneTransactionPhase | 'idle',
  stage: PhoneAodRunnerStage | 'idle',
  playConfirmed: boolean | null,
  firstFramePresented: boolean | null,
  lastProgress: number | null,
  rollbackReason: PhoneFailureReason | null
];

export type PhoneRunCapability = Readonly<{
  /** Presentation strategy is part of the one machine transaction contract. */
  reducedMotion?: boolean;
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

/** Private assembly options; only runtime.ts creates this engine. */
export type PhoneStoryRuntimeEngineOptions = Readonly<{
  initialScene: SceneId;
  authorityId?: string;
  root?: HTMLElement | (() => HTMLElement | null);
  scrollY: () => number;
  scrollTo: (y: number) => void;
  presentation?: PhoneStoryPresentation;
  scheduleFrame?: (callback: () => void) => void;
}>;

/** Context-safe authority facade. It intentionally omits attach()/dispose(). */
export type PhoneStoryRuntimePort = Readonly<{
  /** Canonical external-store read model. */
  getSnapshot(): PhoneStorySnapshot;
  /** Reducer-owned AOD facts exposed without the lifecycle object. */
  readAodDiagnostics(): PhoneAodDiagnostics;
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
  registerEffect(registration: PhoneEffectRegistration): PhoneCapabilityLease;
  registerScrollCorridor(corridor: PhoneScrollCorridor): PhoneScrollCorridorLease;
}>;

/** Private engine; production components receive RuntimePort only. */
export type PhoneStoryRuntimeEngine = PhoneStoryRuntimePort & Readonly<{
  /** Factory-only input ingress; route descendants receive RuntimePort instead. */
  resolveIntent(intent: PhoneIntent): PhoneIntentDisposition;
  /** Factory-only registry ingress for the single document scroll sampler. */
  scrollCorridors: PhoneScrollCorridorRegistry;
  dispose(): void;
}>;
