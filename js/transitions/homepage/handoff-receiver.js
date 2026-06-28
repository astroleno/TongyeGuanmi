import { setRevealPresentedWithin } from '../../ui/reveal.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));

function resolveSource(target, sourceSelector) {
  if (!target) return null;
  if (!sourceSelector) return target;
  return target.matches?.(sourceSelector) ? target : target.querySelector(sourceSelector);
}

function createPlaceholder(doc, source) {
  const rect = source.getBoundingClientRect?.();
  const placeholder = doc.createElement('div');
  placeholder.dataset.handoffPlaceholder = 'true';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.pointerEvents = 'none';
  placeholder.style.minHeight = `${Math.max(0, rect?.height || source.offsetHeight || 0).toFixed(2)}px`;
  placeholder.style.width = '100%';
  return placeholder;
}

export function createHandoffReceiver({
  container,
  host,
  target,
  source,
  sourceSelector = '',
  className = '',
  mode = 'adopt'
} = {}) {
  const mountTarget = container || host;
  const sourceElement = source || resolveSource(target, sourceSelector);
  if (!mountTarget || !sourceElement || !sourceElement.parentNode) return null;

  const doc = mountTarget.ownerDocument || document;
  let receiver = null;
  let marker = null;
  let placeholder = null;
  let projectionClone = null;
  let originalParent = null;
  let originalNextSibling = null;
  let originalStyle = null;
  let originalClass = null;
  let adopted = false;
  let restored = false;

  const adopt = () => {
    if (adopted || restored || !sourceElement.parentNode) return;

    receiver = doc.createElement('div');
    receiver.className = ['homepage-handoff-receiver', className].filter(Boolean).join(' ');
    receiver.dataset.handoffReceiver = 'true';
    receiver.setAttribute('data-handoff-receiver', 'true');
    receiver.setAttribute('aria-hidden', 'true');
    receiver.setAttribute('inert', '');

    marker = doc.createComment(`handoff marker:${sourceSelector || target?.id || sourceElement.id || 'target'}`);
    placeholder = createPlaceholder(doc, sourceElement);
    originalParent = sourceElement.parentNode;
    originalNextSibling = sourceElement.nextSibling;
    originalStyle = sourceElement.getAttribute('style');
    originalClass = sourceElement.getAttribute('class');

    originalParent.insertBefore(marker, sourceElement);
    originalParent.insertBefore(placeholder, sourceElement);
    sourceElement.classList.add('homepage-handoff-receiver__content');
    sourceElement.dataset.handoffAdopted = 'true';
    setRevealPresentedWithin(sourceElement);
    receiver.append(sourceElement);
    mountTarget.append(receiver);
    adopted = true;
  };

  const project = () => {
    if (adopted || restored) return;

    receiver = doc.createElement('div');
    receiver.className = ['homepage-handoff-receiver', className].filter(Boolean).join(' ');
    receiver.dataset.handoffReceiver = 'true';
    receiver.dataset.handoffMode = 'projection';
    receiver.setAttribute('data-handoff-receiver', 'true');
    receiver.setAttribute('aria-hidden', 'true');
    receiver.setAttribute('inert', '');

    projectionClone = sourceElement.cloneNode(true);
    projectionClone.classList.add('homepage-handoff-receiver__content');
    projectionClone.dataset.handoffProjectionClone = 'true';
    projectionClone.removeAttribute('id');
    setRevealPresentedWithin(projectionClone);
    receiver.append(projectionClone);
    mountTarget.append(receiver);
    adopted = true;
  };

  const restore = () => {
    if (restored || !adopted) return;
    restored = true;

    if (mode === 'projection') {
      receiver?.remove();
      projectionClone = null;
      setRevealPresentedWithin(sourceElement);
      adopted = false;
      return;
    }

    if (marker.parentNode) {
      marker.parentNode.insertBefore(sourceElement, marker);
      marker.remove();
    } else if (originalNextSibling?.parentNode === originalParent) {
      originalParent.insertBefore(sourceElement, originalNextSibling);
    } else {
      originalParent.append(sourceElement);
    }

    placeholder.remove();

    if (originalClass === null) {
      sourceElement.removeAttribute('class');
    } else {
      sourceElement.setAttribute('class', originalClass);
    }

    if (originalStyle === null) {
      sourceElement.removeAttribute('style');
    } else {
      sourceElement.setAttribute('style', originalStyle);
    }

    sourceElement.removeAttribute('data-handoff-adopted');
    receiver.remove();
    setRevealPresentedWithin(sourceElement);
    adopted = false;
  };

  return {
    get element() {
      return receiver;
    },
    content: sourceElement,
    update(progress, { start = 0.72, end = 1, restoreAt = end, liftPx = 24 } = {}) {
      const p = smoothStep(range01(progress, start, end));
      if (!adopted && progress < start) return p;
      if (mode === 'projection') {
        project();
      } else {
        adopt();
      }
      if (!receiver) return p;
      receiver.dataset.handoffProgress = p.toFixed(4);
      receiver.dataset.handoffSource = sourceSelector || target?.id || sourceElement.id || 'target';
      receiver.dataset.handoffRestoreAt = String(restoreAt);
      receiver.style.setProperty('--handoff-receiver-opacity', p.toFixed(4));
      receiver.style.setProperty('--handoff-receiver-y', `${((1 - p) * liftPx).toFixed(2)}px`);
      receiver.style.setProperty('--handoff-receiver-blur', `${((1 - p) * 8).toFixed(2)}px`);
      if (progress >= restoreAt) restore();
      return p;
    },
    restore,
    destroy: restore
  };
}
