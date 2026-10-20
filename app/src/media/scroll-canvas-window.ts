type Purpose = 'ink' | 'packed-alpha';
type Entry = { canvas: HTMLCanvasElement; purpose: Purpose; epoch: number; token: object | null; active: boolean; gl: WebGLRenderingContext | null; restoring?: boolean };
type Retired = { canvas: WeakRef<HTMLCanvasElement>; gl: WeakRef<WebGLRenderingContext>; extension: WeakRef<WEBGL_lose_context>; ready: boolean };
const entriesByCanvas = new WeakMap<HTMLCanvasElement, Entry>();
const knownContextsByCanvas = new WeakMap<HTMLCanvasElement, WebGLRenderingContext>();
const managedCanvases = new WeakSet<HTMLCanvasElement>();
const retiredByCanvas = new WeakMap<HTMLCanvasElement, Retired>();
function allowRetiredContextRestore(event: Event) {
  event.preventDefault();
  const retired = retiredByCanvas.get(event.currentTarget as HTMLCanvasElement);
  // Restoration is only legal AFTER the context-lost event has completed,
  // not from a promise microtask inside its dispatch.
  if (retired) setTimeout(() => { retired.ready = true; }, 0);
}

export type ScrollCanvasLease = Readonly<{
  canvas: HTMLCanvasElement;
  current(): boolean;
  release(): void;
}>;

/** Contexts belong to the bounded current window, not to a retired React leaf. */
export function createScrollCanvasWindow() {
  const entries = new Set<Entry>();
  let limit = 0;
  let retiredLimit = 0;
  let disposed = false;
  let restoring = Promise.resolve();
  const retired: Retired[] = [];
  const remember = (handle: Retired) => {
    if (disposed) return;
    retired.push(handle);
    if (retired.length > retiredLimit) retired.splice(0, retired.length - retiredLimit);
  };
  const retire = (entry: Entry, restorable = true) => {
    entries.delete(entry);
    if (entriesByCanvas.get(entry.canvas) === entry) entriesByCanvas.delete(entry.canvas);
    entry.epoch++; entry.active = false;
    entry.canvas.remove(); entry.canvas.width = entry.canvas.height = 1;
    if (entry.gl && !entry.gl.isContextLost()) {
      const extension = entry.gl.getExtension('WEBGL_lose_context');
      if (extension && restorable && !disposed) {
        const handle: Retired = { canvas: new WeakRef(entry.canvas), gl: new WeakRef(entry.gl), extension: new WeakRef(extension), ready: false };
        retiredByCanvas.set(entry.canvas, handle);
        entry.canvas.addEventListener('webglcontextlost', allowRetiredContextRestore, { once: true });
        remember(handle);
      }
      extension?.loseContext();
    }
    entry.gl = null;
  };
  const trim = () => {
    for (const entry of entries) if (!entry.active && (entries.size > limit || !entry.restoring && entry.gl?.isContextLost())) retire(entry);
  };
  return {
    configure(webglContexts: number) { limit = webglContexts; retiredLimit = Math.max(retiredLimit, limit); trim(); },
    /** Lost contexts own no GPU resources. Weak handles cannot keep them alive.
     * Reserve any restored slot INSIDE the new window before mounting leaves. */
    restoreAvailable(signal: AbortSignal): Promise<void> {
      const request = restoring.then(async () => {
        while (!disposed && !signal.aborted && entries.size < limit && retired.length) {
          const handle = retired.pop()!;
          const canvas = handle.canvas.deref(), gl = handle.gl.deref();
          if (!canvas || !gl || !gl.isContextLost()) continue;
          // getExtension returns null after loss; reuse the pre-loss extension.
          const extension = handle.extension.deref();
          if (!extension) continue;
          const entry: Entry = { canvas, gl, purpose: 'ink', epoch: 0, token: null, active: false, restoring: true };
          entries.add(entry); entriesByCanvas.set(canvas, entry);
          await new Promise<void>((resolve, reject) => {
            let finished = false;
            let poll: ReturnType<typeof setTimeout> | undefined;
            const finish = (error?: Error) => {
              if (finished) return;
              finished = true; clearTimeout(deadline); clearTimeout(poll);
              if (error) { retire(entry, false); reject(error); } else resolve();
            };
            const restored = () => {
              if (finished) {
                if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
                return;
              }
              entry.gl = gl;
              entry.restoring = false;
              if (disposed || signal.aborted || !entries.has(entry)) retire(entry);
              finish();
            };
            const deadline = setTimeout(() => finish(new Error('当前位置的画布恢复超时')), 3000);
            const attempt = () => {
              if (disposed || signal.aborted || !entries.has(entry)) {
                retire(entry, false); remember(handle); finish(); return;
              }
              if (!handle.ready) { poll = setTimeout(attempt, 4); return; }
              canvas.addEventListener('webglcontextrestored', restored, { once: true });
              try { extension.restoreContext(); } catch {
                canvas.removeEventListener('webglcontextrestored', restored);
                finish(new Error('当前位置的画布未能恢复'));
              }
            };
            attempt();
          });
        }
      });
      restoring = request.catch(() => undefined);
      return request;
    },
    acquire(purpose: Purpose, document: Document): ScrollCanvasLease {
      // Both renderers use identical context attributes and initialize their
      // own GL state; shader purpose does not require another GPU context.
      let entry = [...entries].find((candidate) => !candidate.active && !candidate.restoring && !candidate.gl?.isContextLost());
      if (!entry) {
        // Reclaim a lost idle context before allocating its replacement.
        for (const candidate of entries) if (!candidate.active && entries.size >= limit) retire(candidate);
        entry = { canvas: document.createElement('canvas'), purpose, epoch: 0, token: null, active: false, gl: null };
        entries.add(entry); entriesByCanvas.set(entry.canvas, entry); managedCanvases.add(entry.canvas);
      }
      const owned = entry, token = {};
      owned.purpose = purpose;
      owned.epoch++; owned.token = token;
      owned.active = true;
      for (const attribute of [...owned.canvas.attributes]) owned.canvas.removeAttribute(attribute.name);
      owned.canvas.width = owned.canvas.height = 1;
      const current = () => owned.active && owned.token === token;
      return { get canvas() { return owned.canvas; }, current, release() {
        if (!current()) return;
        owned.active = false; owned.epoch++;
        owned.canvas.remove(); owned.canvas.width = owned.canvas.height = 1;
        trim();
      } };
    },
    snapshot: () => ({ canvases: entries.size, webglContexts: [...entries].filter((entry) => entry.gl && !entry.gl.isContextLost()).length,
      active: [...entries].filter((entry) => entry.active).length, idle: [...entries].filter((entry) => !entry.active).length }),
    dispose() { disposed = true; for (const entry of entries) retire(entry); retired.length = 0; }
  };
}

export type ScrollCanvasWindow = ReturnType<typeof createScrollCanvasWindow>;
export function windowOwnsCanvas(canvas: HTMLCanvasElement): boolean { return entriesByCanvas.has(canvas); }
/** Includes retired leases: legacy cleanup must not create a context to retire it. */
export function wasWindowManagedCanvas(canvas: HTMLCanvasElement): boolean { return managedCanvases.has(canvas); }
/** Failed renderer initialization may allocate GL before returning no renderer.
 * Retire only a known detached standalone context; never probe an unused canvas
 * or take a leased context away from its current-window owner. */
export function retireDetachedCanvasContext(canvas: HTMLCanvasElement): void {
  if (canvas.isConnected || wasWindowManagedCanvas(canvas)) return;
  const gl = knownContextsByCanvas.get(canvas);
  knownContextsByCanvas.delete(canvas);
  if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
}
export function canvasLeaseGuard(canvas: HTMLCanvasElement): () => boolean {
  const entry = entriesByCanvas.get(canvas), epoch = entry?.epoch;
  return () => !entry || (entry.active && entry.epoch === epoch);
}
export function renewWindowCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const entry = entriesByCanvas.get(canvas);
  if (!entry || !entry.active) return null;
  const next = canvas.cloneNode(false) as HTMLCanvasElement;
  next.width = next.height = 1;
  entriesByCanvas.delete(canvas);
  if (entry.gl && !entry.gl.isContextLost()) entry.gl.getExtension('WEBGL_lose_context')?.loseContext();
  entry.gl = null; entry.epoch++; entry.canvas = next;
  entriesByCanvas.set(next, entry); managedCanvases.add(next); canvas.replaceWith(next);
  return next;
}
export function getCanvasWebGlContext(canvas: HTMLCanvasElement, attributes: WebGLContextAttributes) {
  const entry = entriesByCanvas.get(canvas);
  const gl = canvas.getContext('webgl', entry ? { ...attributes, powerPreference: 'high-performance', preserveDrawingBuffer: false } : attributes);
  if (gl) knownContextsByCanvas.set(canvas, gl);
  if (entry) entry.gl = gl;
  return gl;
}
