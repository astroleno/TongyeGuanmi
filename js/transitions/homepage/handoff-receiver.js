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
  target,
  sourceSelector = '',
  className = ''
} = {}) {
  const source = resolveSource(target, sourceSelector);
  if (!container || !target || !source || !source.parentNode) return null;

  const doc = container.ownerDocument || document;
  const receiver = doc.createElement('div');
  receiver.className = ['homepage-handoff-receiver', className].filter(Boolean).join(' ');
  receiver.dataset.handoffReceiver = 'true';
  receiver.setAttribute('data-handoff-receiver', 'true');
  receiver.setAttribute('aria-hidden', 'true');
  receiver.setAttribute('inert', '');

  const marker = doc.createComment(`handoff marker:${sourceSelector || target.id || 'target'}`);
  const placeholder = createPlaceholder(doc, source);
  const originalParent = source.parentNode;
  const originalNextSibling = source.nextSibling;
  const originalStyle = source.getAttribute('style');
  const originalClass = source.getAttribute('class');
  let restored = false;

  originalParent.insertBefore(marker, source);
  originalParent.insertBefore(placeholder, source);
  source.classList.add('homepage-handoff-receiver__content');
  source.dataset.handoffAdopted = 'true';
  setRevealPresentedWithin(source);
  receiver.append(source);
  container.append(receiver);

  const restore = () => {
    if (restored) return;
    restored = true;

    if (marker.parentNode) {
      marker.parentNode.insertBefore(source, marker);
      marker.remove();
    } else if (originalNextSibling?.parentNode === originalParent) {
      originalParent.insertBefore(source, originalNextSibling);
    } else {
      originalParent.append(source);
    }

    placeholder.remove();

    if (originalClass === null) {
      source.removeAttribute('class');
    } else {
      source.setAttribute('class', originalClass);
    }

    if (originalStyle === null) {
      source.removeAttribute('style');
    } else {
      source.setAttribute('style', originalStyle);
    }

    source.removeAttribute('data-handoff-adopted');
    receiver.remove();
  };

  return {
    element: receiver,
    content: source,
    update(progress, { start = 0.72, end = 1, liftPx = 24 } = {}) {
      const p = smoothStep(range01(progress, start, end));
      receiver.style.setProperty('--handoff-receiver-opacity', p.toFixed(4));
      receiver.style.setProperty('--handoff-receiver-y', `${((1 - p) * liftPx).toFixed(2)}px`);
      receiver.style.setProperty('--handoff-receiver-blur', `${((1 - p) * 8).toFixed(2)}px`);
      if (progress >= end) restore();
      return p;
    },
    restore,
    destroy: restore
  };
}
