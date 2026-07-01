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

function presentRevealWithinSceneRuntime(root) {
  const revealItems = root.matches?.('.reveal')
    ? [root, ...root.querySelectorAll('.reveal')]
    : [...root.querySelectorAll('.reveal')];

  revealItems.forEach((item) => {
    item.classList.add('is-visible');
    item.dataset.entryState = 'presented';
    item.setAttribute('data-entry-state', 'presented');
    item.style.opacity = '1';
    item.style.visibility = 'visible';
    item.style.transform = 'none';
  });
}

export function createSceneRuntimeHandoffReceiver({
  container,
  target,
  sourceSelector = '',
  className = ''
} = {}) {
  const source = resolveSource(target, sourceSelector);
  if (!container || !target || !source || !source.parentNode) return null;

  const doc = container.ownerDocument || document;
  let receiver = null;
  let marker = null;
  let placeholder = null;
  let originalParent = null;
  let originalNextSibling = null;
  let originalStyle = null;
  let originalClass = null;
  let adopted = false;
  let restored = false;

  const adopt = () => {
    if (adopted || restored || !source.parentNode) return;

    receiver = doc.createElement('div');
    receiver.className = ['homepage-handoff-receiver', className].filter(Boolean).join(' ');
    receiver.dataset.sceneRuntimeHandoffReceiver = 'true';
    receiver.setAttribute('data-scene-runtime-handoff-receiver', 'true');
    receiver.setAttribute('aria-hidden', 'true');
    receiver.setAttribute('inert', '');

    marker = doc.createComment(`scene-runtime handoff marker:${sourceSelector || target.id || 'target'}`);
    placeholder = createPlaceholder(doc, source);
    originalParent = source.parentNode;
    originalNextSibling = source.nextSibling;
    originalStyle = source.getAttribute('style');
    originalClass = source.getAttribute('class');

    originalParent.insertBefore(marker, source);
    originalParent.insertBefore(placeholder, source);
    source.classList.add('homepage-handoff-receiver__content');
    source.dataset.sceneRuntimeHandoffAdopted = 'true';
    presentRevealWithinSceneRuntime(source);
    receiver.append(source);
    container.append(receiver);
    adopted = true;
  };

  const restore = () => {
    if (restored || !adopted) return;
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

    source.removeAttribute('data-scene-runtime-handoff-adopted');
    receiver.remove();
    presentRevealWithinSceneRuntime(source);
    adopted = false;
  };

  return {
    get element() {
      return receiver;
    },
    content: source,
    update(progress, { start = 0.72, end = 1, liftPx = 24, restoreAtEnd = true } = {}) {
      const p = smoothStep(range01(progress, start, end));
      if (!adopted && progress < start) return p;
      adopt();
      if (!receiver) return p;
      receiver.style.setProperty('--handoff-receiver-opacity', p.toFixed(4));
      receiver.style.setProperty('--handoff-receiver-y', `${((1 - p) * liftPx).toFixed(2)}px`);
      receiver.style.setProperty('--handoff-receiver-blur', `${((1 - p) * 8).toFixed(2)}px`);
      if (restoreAtEnd && progress >= end) restore();
      return p;
    },
    restore,
    destroy: restore
  };
}
