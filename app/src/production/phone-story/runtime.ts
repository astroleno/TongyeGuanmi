import {
  createPhoneStoryBoot,
  reducePhoneStory,
  type PhoneMachineResult,
  type PhoneMachineSnapshot
} from './machine';
import type {
  PhoneEntryRequest,
  PhoneStoryEffect,
  PhoneStoryEvent,
  PhoneStorySnapshot,
  PhoneViewportSnapshot
} from './protocol';

export type PhoneRuntimeTimerHandle = string | number | Readonly<{ id: string }>;

export type PhoneRuntimeInputEvent = Readonly<{
  type: 'input';
  kind: 'wheel' | 'touch' | 'pointer' | 'keyboard';
  delta?: number;
  key?: string;
  fresh: boolean;
  target: 'story' | 'native-corridor' | 'contact-control';
  trusted?: boolean;
}>;

export type PhoneRuntimeHostEvent =
  | PhoneRuntimeInputEvent
  | Readonly<{ type: 'entry'; request: PhoneEntryRequest }>
  | Readonly<{
      type: 'viewport';
      viewport: PhoneViewportSnapshot;
      change: 'toolbar' | 'layout' | 'unsupported';
    }>
  | Readonly<{
      type: 'scroll';
      sample: Extract<PhoneStoryEvent, { type: 'scroll-sampled' }>['sample'];
    }>
  | Readonly<{ type: 'visibility'; hidden: boolean }>
  | Readonly<{ type: 'pagehide'; persisted: boolean }>
  | Readonly<{ type: 'pageshow'; persisted: boolean }>;

export type PhoneStoryRuntimeEnvironment = Readonly<{
  nextAuthorityId(): string;
  readViewport(): PhoneViewportSnapshot;
  activeNow(): number;
  subscribeHost(listener: (event: PhoneRuntimeHostEvent) => void): () => void;
  scheduleTimer(callback: () => void, delayMs: number): PhoneRuntimeTimerHandle;
  cancelTimer(handle: PhoneRuntimeTimerHandle): void;
  requestFrame(callback: () => void): PhoneRuntimeTimerHandle;
  cancelFrame(handle: PhoneRuntimeTimerHandle): void;
  writeUrl(mode: 'push' | 'replace', pathname: string, hash: string): void;
  observePublish?(snapshot: PhoneStorySnapshot): void;
  performEffect?(
    effect: PhoneStoryEffect,
    enqueue: (event: PhoneStoryEvent) => void
  ): void;
}>;

export type PhoneStoryRuntimeConfig = Readonly<{
  initialEntry: PhoneEntryRequest;
  environment: PhoneStoryRuntimeEnvironment;
}>;

export type PhoneStoryRuntime = Readonly<{
  getSnapshot(): PhoneMachineSnapshot;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  requestEntry(entry: PhoneEntryRequest): void;
  retry(): void;
}>;

type QueuedEvent = Readonly<{ sequence: number; event: PhoneStoryEvent }>;
type DeadlineLease = Readonly<{
  key: string;
  handle: PhoneRuntimeTimerHandle;
  connection: number;
}>;

function attemptIdentity(effect: Extract<PhoneStoryEffect, {
  type: 'schedule-deadline' | 'cancel-deadline' | 'invalidate-attempt'
}>): string {
  const attempt = effect.attempt;
  return [
    attempt.authorityId,
    attempt.transactionId,
    attempt.transactionGeneration,
    attempt.mode,
    attempt.segmentId ?? '',
    attempt.direction ?? ''
  ].join('|');
}

function deadlineKey(
  attempt: Extract<PhoneStoryEffect, { type: 'schedule-deadline' }>['attempt'],
  operation: string
): string {
  return `${attempt.authorityId}|${attempt.transactionId}|${attempt.transactionGeneration}|${operation}`;
}

function inputDirection(event: PhoneRuntimeInputEvent): 'forward' | 'reverse' | null {
  if (event.kind === 'keyboard') {
    if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key ?? '')) return 'forward';
    if (['ArrowUp', 'PageUp'].includes(event.key ?? '')) return 'reverse';
    return null;
  }
  const delta = event.delta ?? 0;
  return delta > 0 ? 'forward' : delta < 0 ? 'reverse' : null;
}

export function phoneEventPriority(event: PhoneStoryEvent): number {
  switch (event.type) {
    case 'disconnect-requested': return 0;
    case 'page-hidden': return 1;
    case 'viewport-sampled': return event.change === 'toolbar' ? 4 : 1;
    case 'failure-reported': return event.slot.attempt.mode === 'rollback' ? 1 : 5;
    case 'evidence-reported': return event.slot.attempt.mode === 'rollback' ? 2 : 5;
    case 'terminal-fault': return 2;
    case 'entry-requested': return 3;
    case 'page-shown': return 4;
    case 'physical-intent':
    case 'scroll-sampled': return 6;
    default: return 5;
  }
}

export function createPhoneStoryRuntime(
  config: PhoneStoryRuntimeConfig
): PhoneStoryRuntime {
  const { environment } = config;
  const inert = createPhoneStoryBoot({
    authorityId: 'disconnected-phone-authority',
    request: config.initialEntry,
    viewport: environment.readViewport()
  });
  let snapshot = inert.snapshot;
  let connected = false;
  let connection = 0;
  let draining = false;
  let sequence = 0;
  let physicalEpoch = 0;
  let queue: QueuedEvent[] = [];
  let removeHostListener: (() => void) | null = null;
  let sampleFrame: PhoneRuntimeTimerHandle | null = null;
  let pendingViewport: Extract<PhoneRuntimeHostEvent, { type: 'viewport' }> | null = null;
  let pendingScroll: Extract<PhoneRuntimeHostEvent, { type: 'scroll' }> | null = null;
  const listeners = new Set<() => void>();
  const deadlines = new Map<string, DeadlineLease>();

  const publish = (): void => {
    environment.observePublish?.(snapshot);
    for (const listener of [...listeners]) listener();
  };

  const cancelDeadline = (key: string): void => {
    const lease = deadlines.get(key);
    if (!lease) return;
    environment.cancelTimer(lease.handle);
    deadlines.delete(key);
  };

  const cancelDeadlines = (predicate: (lease: DeadlineLease) => boolean): void => {
    for (const lease of [...deadlines.values()]) {
      if (predicate(lease)) cancelDeadline(lease.key);
    }
  };

  const activeDeadlineKey = (): string | null => {
    if (snapshot.status !== 'transaction' || !snapshot.transaction.deadline
      || snapshot.transaction.deadline.suspended) return null;
    return deadlineKey(
      snapshot.transaction.attempt,
      snapshot.transaction.deadline.operation
    );
  };

  const syncDeadlines = (): void => {
    const active = activeDeadlineKey();
    cancelDeadlines((lease) => lease.key !== active);
  };

  const dequeue = (): QueuedEvent | null => {
    if (queue.length === 0) return null;
    const selected = queue.reduce((best, item) => {
      const priority = phoneEventPriority(item.event);
      const bestPriority = phoneEventPriority(best.event);
      return priority < bestPriority
        || (priority === bestPriority && item.sequence < best.sequence)
        ? item : best;
    });
    queue = queue.filter((item) => item !== selected);
    return selected;
  };

  const enqueueFor = (event: PhoneStoryEvent, expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    if (event.type === 'scroll-sampled') {
      queue = queue.filter(({ event: queued }) => queued.type !== 'scroll-sampled');
    } else if (event.type === 'viewport-sampled' && event.change === 'toolbar') {
      queue = queue.filter(({ event: queued }) => (
        queued.type !== 'viewport-sampled' || queued.change !== 'toolbar'
      ));
    }
    queue.push({ sequence: ++sequence, event });
    drain();
  };

  const interpret = (effect: PhoneStoryEffect, activeConnection: number): void => {
    if (!connected || activeConnection !== connection) return;
    if (effect.type === 'schedule-deadline') {
      const key = deadlineKey(effect.attempt, effect.operation);
      cancelDeadline(key);
      const handle = environment.scheduleTimer(() => {
        const lease = deadlines.get(key);
        if (!lease || lease.handle !== handle || lease.connection !== activeConnection) return;
        deadlines.delete(key);
        enqueueFor({
          type: 'deadline-fired',
          operation: effect.operation as Extract<PhoneStoryEvent, {
            type: 'deadline-fired'
          }>['operation'],
          attempt: effect.attempt
        }, activeConnection);
      }, effect.timeoutMs);
      deadlines.set(key, { key, handle, connection: activeConnection });
    } else if (effect.type === 'cancel-deadline') {
      cancelDeadline(deadlineKey(effect.attempt, effect.operation));
    } else if (effect.type === 'invalidate-attempt') {
      const identity = attemptIdentity(effect);
      cancelDeadlines((lease) => lease.key.startsWith(
        `${effect.attempt.authorityId}|${effect.attempt.transactionId}|`
      ) || lease.key.startsWith(identity));
    } else if (effect.type === 'push-url' || effect.type === 'replace-url') {
      environment.writeUrl(
        effect.type === 'push-url' ? 'push' : 'replace',
        effect.pathname,
        effect.hash
      );
    } else if (effect.type === 'defer-entry') {
      enqueueFor({ type: 'entry-requested', request: effect.request }, activeConnection);
    }
    environment.performEffect?.(
      effect,
      (event) => enqueueFor(event, activeConnection)
    );
  };

  const applyResult = (result: PhoneMachineResult, activeConnection: number): void => {
    const previous = snapshot;
    snapshot = result.snapshot;
    if (snapshot !== previous) publish();
    syncDeadlines();
    for (const effect of result.effects) interpret(effect, activeConnection);
  };

  const drain = (): void => {
    if (draining || !connected) return;
    draining = true;
    try {
      for (let item = dequeue(); item && connected; item = dequeue()) {
        applyResult(reducePhoneStory(snapshot, item.event), connection);
      }
    } finally {
      draining = false;
    }
  };

  const flushSamples = (expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    sampleFrame = null;
    const viewport = pendingViewport;
    const scroll = pendingScroll;
    pendingViewport = null;
    pendingScroll = null;
    if (viewport) enqueueFor({
      type: 'viewport-sampled',
      viewport: viewport.viewport,
      change: viewport.change
    }, expectedConnection);
    if (scroll) enqueueFor({ type: 'scroll-sampled', sample: scroll.sample }, expectedConnection);
  };

  const scheduleSamples = (expectedConnection: number): void => {
    if (sampleFrame !== null) return;
    sampleFrame = environment.requestFrame(() => flushSamples(expectedConnection));
  };

  const disconnectConnection = (expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    connected = false;
    removeHostListener?.();
    removeHostListener = null;
    cancelDeadlines(() => true);
    if (sampleFrame !== null) environment.cancelFrame(sampleFrame);
    sampleFrame = null;
    pendingViewport = null;
    pendingScroll = null;
    queue = [];
  };

  const handleHost = (event: PhoneRuntimeHostEvent, expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    if (event.type === 'input') {
      if (!event.fresh || event.target !== 'story' || event.trusted === false) return;
      const direction = inputDirection(event);
      if (direction) enqueueFor({
        type: 'physical-intent', direction, epoch: ++physicalEpoch
      }, expectedConnection);
    } else if (event.type === 'entry') {
      enqueueFor({ type: 'entry-requested', request: event.request }, expectedConnection);
    } else if (event.type === 'viewport') {
      pendingViewport = event;
      scheduleSamples(expectedConnection);
    } else if (event.type === 'scroll') {
      pendingScroll = event;
      scheduleSamples(expectedConnection);
    } else if (event.type === 'visibility') {
      enqueueFor(event.hidden
        ? { type: 'page-hidden', persisted: false }
        : { type: 'page-shown', persisted: false }, expectedConnection);
    } else if (event.type === 'pagehide' && event.persisted) {
      enqueueFor({ type: 'page-hidden', persisted: true }, expectedConnection);
    } else if (event.type === 'pagehide') {
      disconnectConnection(expectedConnection);
    } else {
      enqueueFor({ type: 'page-shown', persisted: event.persisted }, expectedConnection);
    }
  };

  const connect = (): (() => void) => {
    if (connected) throw new Error('Phone story runtime already has an active connection');
    const activeConnection = ++connection;
    connected = true;
    physicalEpoch = 0;
    sequence = 0;
    queue = [];
    removeHostListener = environment.subscribeHost(
      (event) => handleHost(event, activeConnection)
    );
    const boot = createPhoneStoryBoot({
      authorityId: environment.nextAuthorityId(),
      request: config.initialEntry,
      viewport: environment.readViewport()
    });
    draining = true;
    try {
      applyResult(boot, activeConnection);
    } finally {
      draining = false;
    }
    drain();
    return () => disconnectConnection(activeConnection);
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    requestEntry: (entry: PhoneEntryRequest) => enqueueFor(
      { type: 'entry-requested', request: entry },
      connection
    ),
    retry: () => enqueueFor({ type: 'retry-requested' }, connection)
  });
}
