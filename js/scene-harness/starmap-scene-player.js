import { initStarFieldReveal } from '../effects/star-field-reveal.js';

const STAR_MAP_SRC = 'assets/back2.png';
const BELIEF_COPY = 'AI 不是技术专家的玩具。它该帮你省下不该花的钱、多接几个客户，再把臃肿的岗位精简下来——能管好这几件事的，才是真利器。它决定了未来三年你是领跑还是追赶。';

const STATES = Object.freeze({
  IDLE: 'idle',
  MOUNTED: 'mounted',
  POSTER: 'poster',
  PLAYING_FORWARD: 'playing-forward',
  COMPLETE: 'complete',
  STABLE: 'stable',
  DESTROYED: 'destroyed'
});

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const ease = (value) => value * value * (3 - 2 * value);

export function createStarmapScenePlayer(options = {}) {
  return new StarmapScenePlayer(options);
}

class StarmapScenePlayer {
  constructor(options = {}) {
    this.options = options;
    this.state = STATES.IDLE;
    this.trace = [STATES.IDLE];
    this.progress = 0;
    this.mode = null;
    this.host = null;
    this.root = null;
    this.createdRoot = false;
    this.starCanvas = null;
    this.copyWrap = null;
    this.sourceLayer = null;
    this.starField = null;
    this.rafId = 0;
    this.activeCancel = null;
    this.pendingWaitCancels = new Set();
    this.onTrace = null;
    this.resizeHandler = null;
  }

  async mount({ host, signal, onTrace } = {}) {
    throwIfAborted(signal);
    if (!host) throw new Error('starmap scene player requires a host element');
    if (this.state !== STATES.IDLE && this.state !== STATES.DESTROYED) return this.getState();

    this.host = typeof host === 'string' ? document.querySelector(host) : host;
    if (!this.host) throw new Error('starmap scene player host was not found');
    this.onTrace = typeof onTrace === 'function' ? onTrace : null;

    this.root = this.host.querySelector('[data-starmap-scene-root]');
    this.createdRoot = !this.root;
    if (!this.root) {
      this.host.replaceChildren();
      this.root = buildSceneDom();
      this.host.append(this.root);
    }

    this.bindElements();
    this.resizeHandler = () => {
      this.renderStableStarField();
    };
    window.addEventListener('resize', this.resizeHandler);

    this.starField = initStarFieldReveal({
      canvas: this.starCanvas,
      sourceUrl: STAR_MAP_SRC,
      autoplay: false,
      config: {
        revealDurationMs: this.options.revealDurationMs || 2800,
        loopTransitionMs: 1200
      }
    });

    this.setSourceVisible();
    this.setState(STATES.MOUNTED);
    return this.getState();
  }

  async showPoster({ signal, direction = 'forward' } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    this.mode = 'poster';
    this.progress = 0;
    this.root.dataset.direction = String(direction);
    this.setSourceVisible();
    if (!(await this.waitForStarFieldReady(signal))) return this.getState();
    this.renderStableStarField();
    this.startSteadyStarField();
    this.setState(STATES.POSTER);
    return this.getState();
  }

  async playForward({ mode = 'reveal', signal, onProgress, onTrace } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    if (typeof onTrace === 'function') this.onTrace = onTrace;
    if (mode !== 'reveal') throw new Error(`unknown starmap playForward mode: ${mode}`);
    this.mode = mode;
    this.progress = 0;
    this.stopSteadyStarField();
    this.setState(STATES.PLAYING_FORWARD);
    return this.playReveal({ signal, onProgress });
  }

  async cancelToSource({ signal } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    this.mode = 'cancel-to-source';
    this.progress = 0;
    this.setSourceVisible();
    if (!(await this.waitForStarFieldReady(signal))) return this.getState();
    this.renderStableStarField();
    this.startSteadyStarField();
    this.setState(STATES.STABLE);
    return this.getState();
  }

  async reverseToPoster({ signal } = {}) {
    this.ensureMounted();
    this.stopActiveWork();
    throwIfAborted(signal);
    this.mode = 'reverse-to-poster';
    this.progress = 0;
    this.setSourceVisible();
    if (!(await this.waitForStarFieldReady(signal))) return this.getState();
    this.renderStableStarField();
    this.startSteadyStarField();
    this.setState(STATES.POSTER);
    return this.getState();
  }

  destroy() {
    this.stopActiveWork();
    this.cancelPendingWaits();
    this.stopSteadyStarField();
    this.starField?.dispose?.();
    this.starField = null;

    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);

    clearCanvas2d(this.starCanvas);

    if (this.createdRoot) {
      this.root?.remove();
    } else if (this.root) {
      delete this.root.dataset.state;
      delete this.root.dataset.mode;
    }

    this.host = null;
    this.root = null;
    this.createdRoot = false;
    this.starCanvas = null;
    this.copyWrap = null;
    this.sourceLayer = null;
    this.progress = 0;
    this.mode = null;
    this.resizeHandler = null;
    this.setState(STATES.DESTROYED);
    return this.getState();
  }

  getState() {
    return {
      state: this.state,
      mode: this.mode,
      progress: this.progress,
      ready: Boolean(this.starField?.ready),
      mounted: Boolean(this.root),
      trace: [...this.trace]
    };
  }

  bindElements() {
    this.starCanvas = this.root.querySelector('[data-starmap-star-canvas]');
    this.copyWrap = this.root.querySelector('[data-starmap-copy]');
    this.sourceLayer = this.root.querySelector('[data-starmap-source]');
    if (!this.starCanvas || !this.copyWrap || !this.sourceLayer) {
      throw new Error('starmap scene DOM is incomplete');
    }
  }

  async playReveal({ signal, onProgress }) {
    if (!(await this.waitForStarFieldReady(signal))) return this.getState();
    this.setSourceVisible();
    const result = await this.animate({
      durationMs: this.options.revealDurationMs || 2800,
      signal,
      onFrame: (raw, now) => {
        const progress = ease(raw);
        this.progress = progress;
        this.starField.renderEntrance(progress, now / 1000);
        this.markStarCanvasReady();
        onProgress?.(progress);
      }
    });
    if (!result.completed) return { ...result, state: this.getState() };
    this.progress = 1;
    this.renderStableStarField();
    this.setState(STATES.COMPLETE);
    this.setState(STATES.STABLE);
    this.startSteadyStarField();
    return { completed: true, state: this.getState() };
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
        if (settled) return;
        if (raw >= 1) {
          finish({ completed: true });
          return;
        }
        this.rafId = window.requestAnimationFrame(frame);
      };
      this.rafId = window.requestAnimationFrame(frame);
    });
  }

  startSteadyStarField() {
    this.stopSteadyStarField();
    const frame = (now) => {
      if (!this.root || this.state === STATES.DESTROYED) return;
      this.renderStableStarField(now);
      this.rafId = window.requestAnimationFrame(frame);
    };
    this.rafId = window.requestAnimationFrame(frame);
  }

  stopSteadyStarField() {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  stopActiveWork() {
    if (this.activeCancel) {
      this.activeCancel();
      return;
    }
    this.stopSteadyStarField();
  }

  renderStableStarField(now = performance.now()) {
    if (!this.starField?.ready) return;
    const timeSeconds = now / 1000;
    this.starField.renderBackground({
      timeSeconds,
      strength: 1.05 + Math.sin(timeSeconds * .34) * .08 + Math.sin(timeSeconds * .17) * .05,
      noiseFloor: .028
    });
    this.markStarCanvasReady();
  }

  markStarCanvasReady() {
    this.starCanvas?.classList.add('is-ready');
    if (this.starCanvas) this.starCanvas.dataset.starmapTextureReady = 'true';
  }

  setSourceVisible() {
    if (!this.root) return;
    if (this.sourceLayer) this.sourceLayer.style.opacity = '1';
    if (this.copyWrap) {
      this.copyWrap.style.opacity = '';
      this.copyWrap.style.filter = '';
      this.copyWrap.style.transform = '';
    }
  }

  waitForStarFieldReady(signal) {
    return waitUntil(
      () => Boolean(this.starField?.ready),
      signal,
      (cancel) => {
        this.pendingWaitCancels.add(cancel);
        return () => this.pendingWaitCancels.delete(cancel);
      }
    );
  }

  cancelPendingWaits() {
    const cancels = [...this.pendingWaitCancels];
    this.pendingWaitCancels.clear();
    cancels.forEach((cancel) => cancel());
  }

  setState(nextState) {
    this.state = nextState;
    if (this.root) {
      this.root.dataset.state = nextState;
      this.root.dataset.mode = this.mode || '';
    }
    if (this.trace[this.trace.length - 1] !== nextState) {
      this.trace.push(nextState);
      this.onTrace?.(this.getState());
    }
  }

  ensureMounted() {
    if (!this.root || this.state === STATES.IDLE || this.state === STATES.DESTROYED) {
      throw new Error('starmap scene player is not mounted');
    }
  }
}

function buildSceneDom() {
  const root = document.createElement('section');
  root.className = 'starmap-scene canvas-section canvas-section--belief';
  root.dataset.starmapSceneRoot = '';
  root.setAttribute('aria-label', '同野观幂观点');
  root.innerHTML = `
    <div class="starmap-scene__source" data-starmap-source>
      <canvas class="starmap-scene__star-canvas belief-star-field" data-belief-star-field data-starmap-star-canvas aria-hidden="true"></canvas>
      <div class="starmap-scene__wash belief-star-wash" aria-hidden="true"></div>
      <div class="starmap-scene__copy-wrap belief-copy-wrap" data-starmap-copy>
        <p class="starmap-scene__copy large-copy large-copy--standalone">${BELIEF_COPY}</p>
      </div>
    </div>
  `;
  return root;
}

function waitUntil(predicate, signal, registerCancel) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let rafId = 0;
    let unregisterCancel = null;
    let settled = false;
    const cleanup = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      signal?.removeEventListener?.('abort', onAbort);
      unregisterCancel?.();
      unregisterCancel = null;
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
    const onAbort = () => {
      fail(abortError(signal));
    };
    const tick = () => {
      if (predicate()) {
        finish(true);
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    unregisterCancel = registerCancel?.(() => finish(false)) || null;
    tick();
  });
}

function clearCanvas2d(canvas) {
  if (!canvas) return;
  try {
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  } catch {
    // Ignore canvases whose context is no longer available.
  }
  canvas.classList.remove('is-ready');
  delete canvas.dataset.starmapTextureReady;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal) {
  return signal?.reason || (typeof DOMException === 'function'
    ? new DOMException('Aborted', 'AbortError')
    : new Error('Aborted'));
}
