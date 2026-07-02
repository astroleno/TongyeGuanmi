import { TransitionSegmentPlayer } from './TransitionSegmentPlayer.js';

function createElement(layer, tagName) {
  const documentRef = layer?.ownerDocument || globalThis.document;
  if (!documentRef?.createElement) {
    throw new Error('Fake DOM transition player requires a DOM-like layer');
  }
  return documentRef.createElement(tagName);
}

export class FakeDomTransitionPlayer extends TransitionSegmentPlayer {
  constructor({
    layer = null,
    defaultDurationMs = 24,
    defaultTimeoutMs = 1000,
    behavior = {}
  } = {}) {
    super({ defaultDurationMs, defaultTimeoutMs, behavior });
    this.layer = layer;
  }

  setLayer(layer) {
    this.layer = layer;
  }

  renderTransition({ segmentId, from, to, attemptId, epoch } = {}) {
    if (!this.layer) return null;
    this.layer.replaceChildren?.();
    this.layer.dataset.transitionActive = 'true';
    this.layer.dataset.transitionSegment = segmentId;
    this.layer.dataset.transitionFrom = from || '';
    this.layer.dataset.transitionTo = to || '';

    const marker = createElement(this.layer, 'div');
    marker.setAttribute('data-fake-transition', '');
    marker.setAttribute('data-transition-segment', segmentId);
    marker.setAttribute('data-transition-from', from || '');
    marker.setAttribute('data-transition-to', to || '');
    marker.setAttribute('data-attempt-id', String(attemptId ?? ''));
    marker.setAttribute('data-epoch', String(epoch ?? ''));
    marker.textContent = `${from || 'none'} -> ${to || 'none'} (${segmentId})`;
    this.layer.appendChild(marker);
    return marker;
  }

  clearTransition(reason = 'transition-clear') {
    if (!this.layer) return;
    this.layer.replaceChildren?.();
    this.layer.dataset.transitionActive = 'false';
    this.layer.dataset.transitionClearReason = reason;
    delete this.layer.dataset.transitionSegment;
    delete this.layer.dataset.transitionFrom;
    delete this.layer.dataset.transitionTo;
  }

  async play(options = {}) {
    this.renderTransition(options);
    try {
      return await super.play(options);
    } finally {
      this.clearTransition('play-finally');
    }
  }
}

export function createFakeDomTransitionPlayer(options = {}) {
  return new FakeDomTransitionPlayer(options);
}
