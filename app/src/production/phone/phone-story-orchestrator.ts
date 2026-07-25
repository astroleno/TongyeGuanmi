import type { SceneId } from '../../story/types';
import {
  phoneRun,
  phoneRunForHold,
  type PhoneRunId
} from './phone-story-runs';
import {
  createPhoneStoryHold,
  reducePhoneStoryCursor,
  startPhoneStoryRun,
  type PhoneStoryCursor,
  type PhoneTransitionPhase
} from './phone-story-state';
import {
  phoneTransitionCrossesBoundary,
  type PhoneIntent,
  type PhoneTransitionDirection,
  type PhoneTransitionSession
} from './phone-transition-coordinator';

export type PhoneOrchestratedRunSession = PhoneTransitionSession & Readonly<{
  sessionId: string;
  generation: number;
  phase(phase: Exclude<PhoneTransitionPhase, 'rolling-back'>): void;
  progress(progress: number): void;
  advanceLeg(): void;
}>;

export type PhoneRunCapability = Readonly<{
  position(direction: PhoneTransitionDirection): number | null;
  canStart(direction: PhoneTransitionDirection): boolean;
  start(
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ): boolean | void;
}>;

export type PhoneCapabilityLease = Readonly<{
  dispose(): void;
}>;

export type PhoneStoryOrchestratorOptions = Readonly<{
  initialScene: SceneId;
  root?: HTMLElement;
  scrollY: () => number;
  scrollTo: (y: number) => void;
  onCursor?: (cursor: PhoneStoryCursor) => void;
  onLockChange?: (locked: boolean) => void;
  onRetryable?: (run: PhoneRunId) => void;
}>;

export type PhoneStoryOrchestrator = Readonly<{
  cursor(): PhoneStoryCursor;
  handleIntent(intent: PhoneIntent): boolean;
  reconcileHold(scene: SceneId): void;
  registerRunCapability(
    run: PhoneRunId,
    ownerId: string,
    capability: PhoneRunCapability
  ): PhoneCapabilityLease;
  dispose(): void;
}>;

type RegisteredCapability = Readonly<{
  ownerId: string;
  token: number;
  capability: PhoneRunCapability;
}>;

type ActiveRun = {
  sessionId: string;
  generation: number;
  run: PhoneRunId;
  inputEpoch: number;
  anchorY: number;
};

export function createPhoneStoryOrchestrator(
  options: PhoneStoryOrchestratorOptions
): PhoneStoryOrchestrator {
  const capabilities = new Map<PhoneRunId, RegisteredCapability>();
  let capabilityToken = 0;
  let generation = 0;
  let sessionSequence = 0;
  let consumedInputEpoch = 0;
  let current: PhoneStoryCursor = createPhoneStoryHold(options.initialScene);
  let active: ActiveRun | null = null;
  let disposed = false;

  const publishCursor = (next: PhoneStoryCursor) => {
    current = next;
    const root = options.root;
    if (root) {
      root.dataset.phoneCursor = next.kind === 'hold'
        ? `hold:${next.scene}`
        : `transition:${next.run}:${next.legIndex}`;
      if (next.kind === 'transition') {
        root.dataset.phoneSession = next.sessionId;
        root.dataset.phoneSegment = next.segment;
        root.dataset.phoneTransitionPhase = next.phase;
      } else {
        delete root.dataset.phoneSession;
        delete root.dataset.phoneSegment;
        delete root.dataset.phoneTransitionPhase;
      }
    }
    options.onCursor?.(next);
  };
  const publishLock = (locked: boolean) => {
    const root = options.root;
    if (root) {
      if (locked) root.dataset.phoneTransitionLock = 'locked';
      else delete root.dataset.phoneTransitionLock;
    }
    options.onLockChange?.(locked);
  };
  const activeOwns = (run: ActiveRun) => (
    !disposed
    && active === run
    && current.kind === 'transition'
    && current.sessionId === run.sessionId
    && current.generation === run.generation
  );
  const dispatch = (
    run: ActiveRun,
    event: Parameters<typeof reducePhoneStoryCursor>[1]
  ) => {
    if (!activeOwns(run)) return;
    publishCursor(reducePhoneStoryCursor(current, event));
  };
  const finishCommit = (run: ActiveRun, anchorY?: number) => {
    if (!activeOwns(run)) return;
    const definition = phoneRun(run.run);
    while (
      current.kind === 'transition'
      && (
        current.direction === 1
          ? current.legIndex < definition.legs.length - 1
          : current.legIndex > 0
      )
    ) {
      publishCursor(reducePhoneStoryCursor(current, {
        type: 'ADVANCE_LEG',
        sessionId: run.sessionId,
        generation: run.generation
      }));
    }
    publishCursor(reducePhoneStoryCursor(current, {
      type: 'COMMIT',
      sessionId: run.sessionId,
      generation: run.generation
    }));
    if (anchorY !== undefined) options.scrollTo(anchorY);
    active = null;
    publishLock(false);
  };
  const finishRollback = (run: ActiveRun, anchorY?: number) => {
    if (!activeOwns(run)) return;
    publishCursor(reducePhoneStoryCursor(current, {
      type: 'FAIL',
      sessionId: run.sessionId,
      generation: run.generation
    }));
    publishCursor(reducePhoneStoryCursor(current, {
      type: 'ROLLBACK_COMMITTED',
      sessionId: run.sessionId,
      generation: run.generation
    }));
    options.scrollTo(anchorY ?? run.anchorY);
    active = null;
    publishLock(false);
    options.onRetryable?.(run.run);
  };

  publishCursor(current);

  return {
    cursor: () => current,
    handleIntent(intent) {
      if (disposed) return false;
      if (active) return true;
      if (intent.inputEpoch <= consumedInputEpoch || current.kind !== 'hold') {
        return false;
      }
      const definition = phoneRunForHold(current.scene, intent.direction);
      if (!definition) return false;
      const registered = capabilities.get(definition.id);
      if (!registered) return false;
      const position = registered.capability.position(intent.direction);
      if (
        position === null
        || !phoneTransitionCrossesBoundary(
          intent.startY,
          intent.projectedY,
          position,
          intent.direction
        )
        || !registered.capability.canStart(intent.direction)
      ) return false;

      consumedInputEpoch = intent.inputEpoch;
      generation += 1;
      const run: ActiveRun = {
        sessionId: `phone-session-${++sessionSequence}`,
        generation,
        run: definition.id,
        inputEpoch: intent.inputEpoch,
        anchorY: position
      };
      active = run;
      options.scrollTo(position);
      publishCursor(startPhoneStoryRun(
        current,
        definition.id,
        intent.direction,
        run
      ));
      publishLock(true);
      const valid = () => activeOwns(run);
      const session: PhoneOrchestratedRunSession = {
        sessionId: run.sessionId,
        generation: run.generation,
        valid,
        moveTo(anchorY) {
          if (!valid()) return;
          run.anchorY = anchorY;
          options.scrollTo(anchorY);
        },
        complete: (anchorY) => finishCommit(run, anchorY),
        abort: (anchorY) => finishRollback(run, anchorY),
        phase: (phase) => dispatch(run, {
          type: 'PHASE',
          sessionId: run.sessionId,
          generation: run.generation,
          phase
        }),
        progress: (progress) => dispatch(run, {
          type: 'PROGRESS',
          sessionId: run.sessionId,
          generation: run.generation,
          progress
        }),
        advanceLeg: () => dispatch(run, {
          type: 'ADVANCE_LEG',
          sessionId: run.sessionId,
          generation: run.generation
        })
      };
      try {
        if (registered.capability.start(intent.direction, session) === false) {
          finishRollback(run);
          return false;
        }
      } catch {
        finishRollback(run);
        return false;
      }
      return true;
    },
    reconcileHold(scene) {
      if (disposed || active || current.kind !== 'hold' || current.scene === scene) {
        return;
      }
      publishCursor(createPhoneStoryHold(scene, current.revision + 1));
    },
    registerRunCapability(run, ownerId, capability) {
      if (disposed) throw new Error('Phone story orchestrator is disposed');
      const existing = capabilities.get(run);
      if (existing && existing.ownerId !== ownerId) {
        throw new Error(
          `Phone run ${run} already belongs to ${existing.ownerId}`
        );
      }
      const registered: RegisteredCapability = {
        ownerId,
        token: ++capabilityToken,
        capability
      };
      capabilities.set(run, registered);
      return {
        dispose() {
          if (capabilities.get(run)?.token === registered.token) {
            capabilities.delete(run);
          }
        }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      capabilities.clear();
      active = null;
      publishLock(false);
    }
  };
}
