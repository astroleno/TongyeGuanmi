import type {
  PhoneChunkRecoveryPort,
  PhoneRejectedChunkFailure,
  PhoneStableRecoveryProof
} from './phone-story/runtime';

const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
const manifestFetchDeadlineMs = 3_000;

export type PhoneChunkFailureClass =
  | 'phone-core'
  | 'scene-leaf'
  | 'transition-leaf';

export type PhoneChunkRecoveryLineage = Readonly<{
  lineageId: string;
  entryUrl: string;
  firstDocumentBuildId: string;
  currentDocumentBuildId: string | null;
  deployedBuildId: string | null;
  failedModuleUrl: string | null;
  failedModuleClass: PhoneChunkFailureClass;
  automaticReloadCount: 0 | 1;
  status: 'classifying' | 'waiting-online' | 'reloaded' | 'fail-closed';
}>;

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PhoneChunkRecoveryEnvironment = Readonly<{
  currentBuildId: string;
  entryUrl: string;
  storage: RecoveryStorage | null;
  isOnline(): boolean;
  waitForOnline(): Promise<void>;
  fetchReleaseManifest(url: string, init: RequestInit): Promise<unknown>;
  reload(entryUrl?: string): void;
  createLineageId(): string;
  activeNow?(): number;
  isDocumentHidden?(): boolean;
  scheduleTimer?(callback: () => void, delayMs: number): unknown;
  cancelTimer?(handle: unknown): void;
  subscribeVisibility?(listener: () => void): () => void;
}>;

export type PhoneChunkRecoverySnapshot =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'classifying' | 'waiting-online' | 'reloading' | 'fail-closed';
      lineage: PhoneChunkRecoveryLineage | null;
      message: string;
    }>;

export type PhoneChunkRecoveryController = Readonly<{
  port: PhoneChunkRecoveryPort;
  getSnapshot(): PhoneChunkRecoverySnapshot;
  subscribe(listener: () => void): () => void;
  reportPhoneCoreRejection(
    error: unknown,
    moduleUrl?: string
  ): Promise<'reloading' | 'fail-closed'>;
  handlePreloadError(event: Event): void;
  manualReload(): void;
}>;

type ChunkFailure = Readonly<{
  moduleUrl: string;
  moduleClass: PhoneChunkFailureClass;
  reason: string;
}>;

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validLineage(value: unknown): value is PhoneChunkRecoveryLineage {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.lineageId === 'string'
    && typeof record.entryUrl === 'string'
    && typeof record.firstDocumentBuildId === 'string'
    && (record.currentDocumentBuildId === null
      || typeof record.currentDocumentBuildId === 'string')
    && (record.deployedBuildId === null || typeof record.deployedBuildId === 'string')
    && (record.failedModuleUrl === null || typeof record.failedModuleUrl === 'string')
    && ['phone-core', 'scene-leaf', 'transition-leaf']
      .includes(String(record.failedModuleClass))
    && (record.automaticReloadCount === 0 || record.automaticReloadCount === 1)
    && ['classifying', 'waiting-online', 'reloaded', 'fail-closed']
      .includes(String(record.status));
}

function leafFailureClass(failure: PhoneRejectedChunkFailure): PhoneChunkFailureClass {
  return failure.dependencies.some((dependency) => dependency.startsWith('transition:'))
    ? 'transition-leaf'
    : 'scene-leaf';
}

function activeDeadlineSignal(environment: PhoneChunkRecoveryEnvironment): Readonly<{
  signal: AbortSignal;
  dispose(): void;
}> {
  const controller = new AbortController();
  const activeNow = environment.activeNow ?? (() => performance.now());
  const schedule = environment.scheduleTimer
    ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const cancel = environment.cancelTimer
    ?? ((handle) => globalThis.clearTimeout(handle as number));
  const hidden = environment.isDocumentHidden ?? (() => false);
  let remaining = manifestFetchDeadlineMs;
  let startedAt = activeNow();
  let timer: unknown = null;
  const pause = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
    remaining = Math.max(0, remaining - (activeNow() - startedAt));
  };
  const resume = () => {
    if (timer !== null || hidden() || controller.signal.aborted) return;
    if (remaining <= 0) {
      controller.abort(new DOMException('Release manifest timed out', 'TimeoutError'));
      return;
    }
    startedAt = activeNow();
    timer = schedule(() => {
      timer = null;
      remaining = 0;
      controller.abort(new DOMException('Release manifest timed out', 'TimeoutError'));
    }, remaining);
  };
  const onVisibility = () => { if (hidden()) pause(); else resume(); };
  const unsubscribe = environment.subscribeVisibility?.(onVisibility)
    ?? (() => undefined);
  resume();
  return {
    signal: controller.signal,
    dispose() {
      pause();
      unsubscribe();
    }
  };
}

function deployedBuildId(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const sourceCommit = (manifest as Record<string, unknown>).sourceCommit;
  return typeof sourceCommit === 'string' && sourceCommit.length > 0
    ? sourceCommit
    : null;
}

export function createPhoneChunkRecoveryController(
  environment: PhoneChunkRecoveryEnvironment
): PhoneChunkRecoveryController {
  const listeners = new Set<() => void>();
  let snapshot: PhoneChunkRecoverySnapshot = Object.freeze({ status: 'idle' });
  let pending: Promise<'reloading' | 'fail-closed'> | null = null;
  const publish = (next: PhoneChunkRecoverySnapshot) => {
    snapshot = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  };
  const failClosed = (
    message: string,
    lineage: PhoneChunkRecoveryLineage | null,
    persist = true
  ): 'fail-closed' => {
    const failed = lineage ? Object.freeze({ ...lineage, status: 'fail-closed' as const }) : null;
    if (persist && failed && environment.storage) {
      try {
        environment.storage.setItem(lineageStorageKey, JSON.stringify(failed));
      } catch {}
    }
    publish({ status: 'fail-closed', lineage: failed, message });
    return 'fail-closed';
  };
  const recover = async (failure: ChunkFailure): Promise<'reloading' | 'fail-closed'> => {
    const storage = environment.storage;
    if (!storage) return failClosed('自动恢复不可用，请手动重新加载。', null, false);
    let stored: string | null;
    try {
      stored = storage.getItem(lineageStorageKey);
    } catch {
      return failClosed('自动恢复不可用，请手动重新加载。', null, false);
    }
    let previous: PhoneChunkRecoveryLineage | null = null;
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (!validLineage(parsed)) throw new Error('invalid recovery lineage');
        previous = parsed;
      } catch {
        return failClosed('恢复记录损坏，请手动重新加载。', null, false);
      }
    }
    const lineage: PhoneChunkRecoveryLineage = Object.freeze({
      lineageId: previous?.lineageId ?? environment.createLineageId(),
      entryUrl: previous?.entryUrl ?? environment.entryUrl,
      firstDocumentBuildId: previous?.firstDocumentBuildId ?? environment.currentBuildId,
      currentDocumentBuildId: environment.currentBuildId,
      deployedBuildId: previous?.deployedBuildId ?? null,
      failedModuleUrl: failure.moduleUrl,
      failedModuleClass: failure.moduleClass,
      automaticReloadCount: previous?.automaticReloadCount ?? 0,
      status: 'classifying'
    });
    if (lineage.automaticReloadCount >= 1) {
      return failClosed('自动恢复次数已用尽，请手动重新加载。', lineage);
    }
    try {
      storage.setItem(lineageStorageKey, JSON.stringify(lineage));
    } catch {
      return failClosed('自动恢复不可用，请手动重新加载。', null, false);
    }
    publish({ status: 'classifying', lineage, message: '正在检查发布版本…' });
    if (!environment.isOnline()) {
      const waiting = Object.freeze({ ...lineage, status: 'waiting-online' as const });
      try {
        storage.setItem(lineageStorageKey, JSON.stringify(waiting));
      } catch {
        return failClosed('自动恢复不可用，请手动重新加载。', null, false);
      }
      publish({ status: 'waiting-online', lineage: waiting, message: '网络恢复后将继续。' });
      await environment.waitForOnline();
    }
    const deadline = activeDeadlineSignal(environment);
    let manifest: unknown;
    try {
      manifest = await environment.fetchReleaseManifest('/r5-release-manifest.json', {
        cache: 'no-store',
        signal: deadline.signal
      });
    } catch (error) {
      deadline.dispose();
      return failClosed(`无法确认发布版本：${failureMessage(error)}`, lineage);
    }
    deadline.dispose();
    const deployed = deployedBuildId(manifest);
    if (!deployed) return failClosed('发布版本响应无效，请手动重新加载。', lineage);
    const reloaded = Object.freeze({
      ...lineage,
      deployedBuildId: deployed,
      automaticReloadCount: 1 as const,
      status: 'reloaded' as const
    });
    try {
      storage.setItem(lineageStorageKey, JSON.stringify(reloaded));
    } catch {
      return failClosed('自动恢复不可用，请手动重新加载。', null, false);
    }
    publish({ status: 'reloading', lineage: reloaded, message: '正在重新加载最新版本…' });
    environment.reload(reloaded.entryUrl);
    return 'reloading';
  };
  const report = (failure: ChunkFailure) => {
    if (snapshot.status === 'reloading') return Promise.resolve('reloading' as const);
    if (snapshot.status === 'fail-closed') return Promise.resolve('fail-closed' as const);
    if (pending) return pending;
    pending = recover(failure).finally(() => { pending = null; });
    return pending;
  };
  const markStable = (_proof: PhoneStableRecoveryProof) => {
    try { environment.storage?.removeItem(lineageStorageKey); } catch {}
    publish({ status: 'idle' });
  };
  const port: PhoneChunkRecoveryPort = Object.freeze({
    reportRejectedChunk: (failure) => report({
      moduleUrl: failure.moduleUrl,
      moduleClass: leafFailureClass(failure),
      reason: failure.reason
    }),
    markStable
  });
  const controller: PhoneChunkRecoveryController = Object.freeze({
    port,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reportPhoneCoreRejection: (error, moduleUrl = 'unknown-phone-core') => report({
      moduleUrl,
      moduleClass: 'phone-core',
      reason: failureMessage(error)
    }),
    handlePreloadError(event) {
      event.preventDefault();
      const payload = (event as Event & { payload?: unknown }).payload;
      const moduleUrl = payload && typeof payload === 'object'
        && typeof (payload as Record<string, unknown>).url === 'string'
        ? String((payload as Record<string, unknown>).url)
        : 'unknown-phone-preload';
      void controller.reportPhoneCoreRejection(event, moduleUrl);
    },
    manualReload: environment.reload
  });
  return controller;
}

export function createBrowserPhoneChunkRecoveryController(): PhoneChunkRecoveryController {
  let storage: RecoveryStorage | null = null;
  try { storage = window.sessionStorage; } catch {}
  return createPhoneChunkRecoveryController({
    currentBuildId: import.meta.env.VITE_R5_DOCUMENT_BUILD_ID || 'development',
    entryUrl: window.location.href,
    storage,
    isOnline: () => navigator.onLine !== false,
    waitForOnline: () => new Promise((resolve) => {
      window.addEventListener('online', () => resolve(), { once: true });
    }),
    fetchReleaseManifest: async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`release manifest HTTP ${response.status}`);
      return response.json();
    },
    reload: (entryUrl) => {
      if (entryUrl) {
        try {
          const target = new URL(entryUrl, window.location.href);
          if (target.origin === window.location.origin
            && target.href !== window.location.href) {
            window.location.replace(`${target.pathname}${target.search}${target.hash}`);
            return;
          }
        } catch {}
      }
      window.location.reload();
    },
    createLineageId: () => globalThis.crypto?.randomUUID?.()
      ?? `r5-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    activeNow: () => performance.now(),
    isDocumentHidden: () => document.visibilityState === 'hidden',
    scheduleTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelTimer: (handle) => window.clearTimeout(handle as number),
    subscribeVisibility: (listener) => {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    }
  });
}

let installedController: PhoneChunkRecoveryController | null = null;

export function installPhoneChunkRecoveryController(
  controller: PhoneChunkRecoveryController
): () => void {
  installedController = controller;
  return () => {
    if (installedController === controller) installedController = null;
  };
}

/** Load only the selected presentation family. */
export function loadDesktopStoryShell() {
  return import('./desktop/DesktopStoryShell').then(({ DesktopStoryShell }) => ({
    default: DesktopStoryShell
  }));
}

export function loadPhoneStoryShell() {
  return import('./phone-story/PhoneStoryShell').catch((error) => {
    void installedController?.reportPhoneCoreRejection(error);
    throw error;
  }).then(({ PhoneStoryShell }) => ({ default: PhoneStoryShell }));
}

export function loadPhoneBrandLabStory() {
  return import('./phone-story/PhoneBrandLabStory').then(({ PhoneBrandLabStory }) => ({
    default: PhoneBrandLabStory
  }));
}
