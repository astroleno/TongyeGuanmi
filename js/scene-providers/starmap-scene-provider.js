import { initStarFieldReveal } from '../effects/star-field-reveal.js';

const STAR_MAP_SRC = 'assets/back2.png';
const BELIEF_COPY = 'AI 不是技术专家的玩具。它该帮你省下不该花的钱、多接几个客户，再把臃肿的岗位精简下来——能管好这几件事的，才是真利器。它决定了未来三年你是领跑还是追赶。';

const STATUS = Object.freeze({
  IDLE: 'idle',
  MOUNTED: 'mounted',
  POSTER: 'poster',
  REVEALING: 'revealing',
  LOOPING: 'looping',
  STABLE: 'stable',
  DESTROYED: 'destroyed'
});

const DEFAULT_REVEAL_MS = 2800;
const DEFAULT_LOOP_MS = 1200;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const ease = (value) => value * value * (3 - 2 * value);

export function createStarmapSceneProvider(options = {}) {
  return new StarmapSceneProvider(options);
}

class StarmapSceneProvider {
  constructor(options = {}) {
    this.options = options;
    this.status = STATUS.IDLE;
    this.trace = [STATUS.IDLE];
    this.progress = 0;
    this.host = null;
    this.root = null;
    this.canvas = null;
    this.copyWrap = null;
    this.createdRoot = false;
    this.reveal = null;
    this.rafId = 0;
    this.activeCancel = null;
    this.onTrace = null;
  }

  async mount({ host, signal, onTrace } = {}) {
    throwIfAborted(signal);
    if (!host) throw new Error('starmap provider requires a host element');
    if (this.status !== STATUS.IDLE && this.status !== STATUS.DESTROYED) return this.getState();

    this.host = typeof host === 'string' ? document.querySelector(host) : host;
    if (!this.host) throw new Error('starmap provider host was not found');
    this.onTrace = typeof onTrace === 'function' ? onTrace : null;

    this.root = this.host.querySelector('[data-starmap-provider-root]');
    this.createdRoot = !this.root;
    if (!this.root) {
      this.host.replaceChildren();
      this.root = buildProviderDom();
      this.host.append(this.root);
    }

    this.canvas = this.root.querySelector('[data-starmap-provider-canvas]');
    this.copyWrap = this.root.querySelector('[data-starmap-provider-copy]');
    if (!this.canvas || !this.copyWrap) throw new Error('starmap provider DOM is incomplete');

    this.reveal = initStarFieldReveal({
      canvas: this.canvas,
      sourceUrl: STAR_MAP_SRC,
      autoplay: false,
      config: {
        revealDurationMs: DEFAULT_REVEAL_MS,
        loopTransitionMs: DEFAULT_LOOP_MS
      }
    });

    this.root.dataset.providerOwner = 'starmap';
    this.root.dataset.providerStatus = STATUS.MOUNTED;
    this.setStatus(STATUS.MOUNTED);
    return this.getState();
  }

  async showPoster({ signal } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    await this.waitReady(signal);
    this.progress = 0;
    this.renderPoster();
    this.setCopyVisible(true);
    this.setStatus(STATUS.POSTER);
    return this.getState();
  }

  async playReveal({ signal, onProgress, durationMs = DEFAULT_REVEAL_MS } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    await this.waitReady(signal);
    this.setCopyVisible(true);
    this.setStatus(STATUS.REVEALING);

    const result = await this.animate({
      durationMs,
      signal,
      onFrame: (raw, now) => {
        const progress = ease(raw);
        this.progress = progress;
        this.reveal.renderEntrance(progress, now / 1000);
        this.markCanvasReady();
        onProgress?.(progress);
      }
    });

    if (!result.completed) return result;
    this.progress = 1;
    this.renderStableFrame();
    this.setStatus(STATUS.STABLE);
    return { completed: true, state: this.getState() };
  }

  async playLoop({ signal, onProgress } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    await this.waitReady(signal);
    this.setCopyVisible(true);
    this.setStatus(STATUS.LOOPING);

    return this.loopUntilStopped({ signal, onProgress });
  }

  async cancelToPoster({ signal } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    await this.waitReady(signal);
    this.progress = 0;
    this.renderPoster();
    this.setCopyVisible(true);
    this.setStatus(STATUS.POSTER);
    return this.getState();
  }

  async reverseToPoster({ signal } = {}) {
    return this.cancelToPoster({ signal });
  }

  destroy() {
    this.stopActiveWork();
    this.reveal?.dispose?.();
    this.reveal = null;
    clearCanvas(this.canvas);

    if (this.createdRoot) {
      this.root?.remove();
    } else if (this.root) {
      delete this.root.dataset.providerOwner;
      delete this.root.dataset.providerStatus;
    }

    this.host = null;
    this.root = null;
    this.canvas = null;
    this.copyWrap = null;
    this.createdRoot = false;
    this.progress = 0;
    this.setStatus(STATUS.DESTROYED);
  }

  getState() {
    return {
      status: this.status,
      progress: this.progress,
      ready: Boolean(this.reveal?.ready),
      mounted: Boolean(this.root),
      trace: [...this.trace]
    };
  }

  renderPoster() {
    this.renderStableFrame(performance.now());
  }

  renderStableFrame(now = performance.now()) {
    if (!this.reveal?.ready) return;
    this.reveal.renderBackground({
      timeSeconds: now / 1000,
      strength: 1.05,
      noiseFloor: .028
    });
    this.markCanvasReady();
  }

  markCanvasReady() {
    this.canvas?.classList.add('is-ready');
    if (this.canvas) this.canvas.dataset.inkTextureReady = 'true';
  }

  setCopyVisible(visible) {
    if (!this.copyWrap) return;
    this.copyWrap.style.opacity = visible ? '1' : '0';
    this.copyWrap.style.filter = visible ? 'blur(0)' : 'blur(9px)';
    this.copyWrap.style.transform = visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 24px, 0)';
  }

  waitReady(signal) {
    return waitUntil(() => Boolean(this.reveal?.ready), signal);
  }

  animate({ durationMs, signal, onFrame }) {
    this.stopActiveWork();
    throwIfAborted(signal);

    return new Promise((resolve, reject) => {
      let settled = false;
      let startedAt = 0;

      const cleanup = () => {
        if (this.rafId) window.cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        this.activeCancel = null;
        signal?.removeEventListener?.('abort', onAbort);
      };

      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const onAbort = () => fail(abortError(signal));
      signal?.addEventListener?.('abort', onAbort, { once: true });
      this.activeCancel = () => finish({ completed: false, cancelled: true });

      const frame = (now) => {
        if (!startedAt) startedAt = now;
        const raw = clamp((now - startedAt) / Math.max(1, durationMs));
        onFrame(raw, now);
        if (raw >= 1) {
          finish({ completed: true });
          return;
        }
        this.rafId = window.requestAnimationFrame(frame);
      };

      this.rafId = window.requestAnimationFrame(frame);
    });
  }

  loopUntilStopped({ signal, onProgress }) {
    this.stopActiveWork();
    throwIfAborted(signal);

    return new Promise((resolve, reject) => {
      let settled = false;
      let startedAt = 0;

      const cleanup = () => {
        if (this.rafId) window.cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        this.activeCancel = null;
        signal?.removeEventListener?.('abort', onAbort);
      };

      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const onAbort = () => fail(abortError(signal));
      signal?.addEventListener?.('abort', onAbort, { once: true });
      this.activeCancel = () => finish({ completed: false, cancelled: true });

      const frame = (now) => {
        if (!startedAt) startedAt = now;
        const timeSeconds = now / 1000;
        const elapsed = now - startedAt;
        const progress = (elapsed % DEFAULT_LOOP_MS) / DEFAULT_LOOP_MS;
        const pulse = Math.sin(timeSeconds * .34) * .08 + Math.sin(timeSeconds * .17) * .05;

        this.progress = progress;
        this.reveal.renderBackground({
          timeSeconds,
          strength: 1.05 + pulse,
          noiseFloor: .028
        });
        this.markCanvasReady();
        onProgress?.(progress);
        this.rafId = window.requestAnimationFrame(frame);
      };

      this.rafId = window.requestAnimationFrame(frame);
    });
  }

  stopActiveWork() {
    if (this.activeCancel) {
      this.activeCancel();
      return;
    }
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  setStatus(status) {
    this.status = status;
    if (this.root) this.root.dataset.providerStatus = status;
    if (this.trace[this.trace.length - 1] !== status) {
      this.trace.push(status);
      this.onTrace?.(this.getState());
    }
  }

  ensureMounted() {
    if (!this.root || this.status === STATUS.IDLE || this.status === STATUS.DESTROYED) {
      throw new Error('starmap provider is not mounted');
    }
  }
}

function buildProviderDom() {
  const root = document.createElement('section');
  root.className = 'starmap-provider-scene canvas-section canvas-section--belief';
  root.dataset.starmapProviderRoot = '';
  root.setAttribute('aria-label', '同野观幂观点');
  root.innerHTML = `
    <canvas class="starmap-provider-scene__canvas belief-star-field" data-belief-star-field data-starmap-provider-canvas aria-hidden="true"></canvas>
    <div class="starmap-provider-scene__wash belief-star-wash" aria-hidden="true"></div>
    <div class="starmap-provider-scene__copy-wrap belief-copy-wrap" data-starmap-provider-copy>
      <p class="starmap-provider-scene__copy large-copy large-copy--standalone">${BELIEF_COPY}</p>
    </div>
  `;
  return root;
}

function waitUntil(predicate, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let rafId = 0;
    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      signal?.removeEventListener?.('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError(signal));
    };
    const tick = () => {
      if (predicate()) {
        cleanup();
        resolve();
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    tick();
  });
}

function clearCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.classList.remove('is-ready');
  delete canvas.dataset.inkTextureReady;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal) {
  return signal?.reason || (typeof DOMException === 'function'
    ? new DOMException('Aborted', 'AbortError')
    : new Error('Aborted'));
}
