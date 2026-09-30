import type { StarFrame, StarWorkerRequest, StarWorkerResponse } from './star-field-protocol';
import workerUrl from './star-field.worker?worker&url';

export async function loadStarFieldFallback() {
  return (await import(/* @vite-ignore */ workerUrl)) as typeof import('./star-field.worker');
}

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<StarWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};
type Options = {
  canvas: HTMLCanvasElement;
  sourceUrl: string;
  onPresented(frameId: number): void;
  onFailure(error: Error): void;
  createWorker?: () => WorkerPort;
};

/** One in-flight bitmap and one replaceable request; never queue animation history. */
export class StarFieldWorkerClient {
  #worker: WorkerPort | null = null;
  #ready = false;
  #disposed = false;
  #generation = 0;
  #frameId = 0;
  #inflight: Extract<StarWorkerRequest, { type: 'render' }> | null = null;
  #pending: StarFrame | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #options: Options;

  constructor(options: Options) { this.#options = options; }

  start(): void {
    try {
      this.#worker = this.#options.createWorker?.()
        ?? new Worker(workerUrl, { type: 'module' });
      this.#worker.onmessage = (event) => this.#receive(event.data);
      this.#worker.onerror = (event) => { event.preventDefault(); this.#fail(new Error(event.message)); };
      this.#worker.onmessageerror = () => this.#fail(new Error('Star worker message failed'));
      this.#deadline();
      this.#worker.postMessage({ type: 'init', sourceUrl: this.#options.sourceUrl } satisfies StarWorkerRequest);
    } catch (error) { this.#fail(error instanceof Error ? error : new Error(String(error))); }
  }

  render(frame: StarFrame): void {
    if (this.#disposed) return;
    this.#pending = frame;
    this.#flush();
  }

  pause(): void {
    this.#generation += 1;
    this.#pending = null;
  }

  dispose(): void {
    this.#disposed = true;
    this.pause();
    clearTimeout(this.#timer);
    this.#worker?.terminate();
    // Leave the receiver able to close an already-delivered late bitmap.
    this.#worker = null;
    this.#inflight = null;
  }

  #deadline(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#fail(new Error('Star worker timed out')), 10_000);
  }

  #fail(error: Error): void {
    if (this.#disposed) return;
    this.dispose();
    this.#options.onFailure(error);
  }

  #flush(): void {
    if (!this.#ready || !this.#worker || this.#inflight || !this.#pending || this.#disposed) return;
    const request: Extract<StarWorkerRequest, { type: 'render' }> = {
      type: 'render', generation: this.#generation, frameId: ++this.#frameId, frame: this.#pending
    };
    this.#pending = null;
    this.#inflight = request;
    this.#deadline();
    try { this.#worker.postMessage(request); }
    catch (error) { this.#fail(error instanceof Error ? error : new Error(String(error))); }
  }

  #receive(message: StarWorkerResponse): void {
    if (message.type === 'frame') {
      const owned = this.#inflight?.frameId === message.frameId;
      if (owned) { this.#inflight = null; clearTimeout(this.#timer); }
      try {
        if (!this.#disposed && owned && message.generation === this.#generation) {
          const { canvas } = this.#options;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Star presentation context unavailable');
          if (canvas.width !== message.bitmap.width) canvas.width = message.bitmap.width;
          if (canvas.height !== message.bitmap.height) canvas.height = message.bitmap.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(message.bitmap, 0, 0);
          this.#options.onPresented(message.frameId);
        }
      } catch (error) { this.#fail(error instanceof Error ? error : new Error(String(error))); }
      finally { message.bitmap.close(); }
      this.#flush();
    } else if (!this.#disposed && message.type === 'ready') {
      this.#ready = true;
      clearTimeout(this.#timer);
      this.#flush();
    } else if (message.type === 'error') this.#fail(new Error(message.message));
  }
}
