export class PhoneReadinessTimeoutError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Phone run readiness timed out: ${missing.join(', ')}`);
    this.name = 'PhoneReadinessTimeoutError';
  }
}

export type PhoneCapabilityRegistration = Readonly<{
  dispose(): void;
}>;

export type PhoneCapabilityRetention = Readonly<{
  dispose(): void;
}>;

export type PhoneCapabilityRegistry<
  Id extends string,
  Handle
> = Readonly<{
  register(
    id: Id,
    ownerId: string,
    handle: Handle
  ): PhoneCapabilityRegistration;
  get(id: Id): Handle | undefined;
  waitFor(
    ids: readonly Id[],
    options: Readonly<{
      signal: AbortSignal;
      timeoutMs: number;
    }>
  ): Promise<void>;
  retain(ids: readonly Id[]): PhoneCapabilityRetention;
  retained(): readonly Id[];
  subscribe(listener: () => void): () => void;
}>;

type RegisteredHandle<Handle> = Readonly<{
  ownerId: string;
  token: number;
  handle: Handle;
}>;

export function createPhoneCapabilityRegistry<
  Id extends string,
  Handle
>(): PhoneCapabilityRegistry<Id, Handle> {
  const handles = new Map<Id, RegisteredHandle<Handle>>();
  const retention = new Map<Id, number>();
  const listeners = new Set<() => void>();
  let token = 0;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    register(id, ownerId, handle) {
      const current = handles.get(id);
      if (current && current.ownerId !== ownerId) {
        throw new Error(
          `Phone capability ${id} already belongs to ${current.ownerId}`
        );
      }
      const registration: RegisteredHandle<Handle> = {
        ownerId,
        token: ++token,
        handle
      };
      handles.set(id, registration);
      notify();
      return {
        dispose() {
          if (handles.get(id)?.token !== registration.token) return;
          handles.delete(id);
          notify();
        }
      };
    },
    get: (id) => handles.get(id)?.handle,
    waitFor(ids, { signal, timeoutMs }) {
      return new Promise<void>((resolve, reject) => {
        let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
        let unsubscribe: () => void = () => undefined;
        let settled = false;
        const missing = () => ids.filter((id) => !handles.has(id));
        const finish = (error?: Error | DOMException) => {
          if (settled) return;
          settled = true;
          if (timeout !== undefined) globalThis.clearTimeout(timeout);
          unsubscribe();
          signal.removeEventListener('abort', onAbort);
          if (error) reject(error);
          else resolve();
        };
        const inspect = () => {
          if (signal.aborted) {
            finish(new DOMException(
              'Phone run readiness aborted',
              'AbortError'
            ));
            return;
          }
          if (missing().length === 0) finish();
        };
        const onAbort = () => finish(new DOMException(
          'Phone run readiness aborted',
          'AbortError'
        ));
        unsubscribe = () => listeners.delete(inspect);
        listeners.add(inspect);
        signal.addEventListener('abort', onAbort, { once: true });
        timeout = globalThis.setTimeout(() => {
          finish(new PhoneReadinessTimeoutError(missing()));
        }, Math.max(0, timeoutMs));
        inspect();
      });
    },
    retain(ids) {
      const retainedIds = [...new Set(ids)];
      for (const id of retainedIds) {
        retention.set(id, (retention.get(id) ?? 0) + 1);
      }
      notify();
      let active = true;
      return {
        dispose() {
          if (!active) return;
          active = false;
          for (const id of retainedIds) {
            const next = (retention.get(id) ?? 0) - 1;
            if (next > 0) retention.set(id, next);
            else retention.delete(id);
          }
          notify();
        }
      };
    },
    retained: () => [...retention.keys()],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
