const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));

function stripRuntimeState(root) {
  if (!root) return;
  const nodes = [root, ...root.querySelectorAll('*')];
  nodes.forEach((node) => {
    node.removeAttribute('id');
    node.classList?.remove('reveal', 'is-visible', 'magnetic');
    if (node.matches?.('a, button, input, textarea, select')) {
      node.setAttribute('tabindex', '-1');
    }
  });
}

export function createHandoffPreview({
  container,
  target,
  sourceSelector = '',
  className = ''
} = {}) {
  if (!container || !target) return null;

  const source = sourceSelector
    ? (target.matches?.(sourceSelector) ? target : target.querySelector(sourceSelector))
    : target;
  if (!source) return null;

  const doc = container.ownerDocument || document;
  const preview = doc.createElement('div');
  preview.className = ['homepage-handoff-preview', className].filter(Boolean).join(' ');
  preview.setAttribute('aria-hidden', 'true');

  const content = source.cloneNode(true);
  content.classList.add('homepage-handoff-preview__content');
  stripRuntimeState(content);
  preview.append(content);
  container.append(preview);

  return {
    element: preview,
    content,
    update(progress, { start = 0.72, end = 1, liftPx = 24 } = {}) {
      const p = smoothStep(range01(progress, start, end));
      preview.style.setProperty('--handoff-preview-opacity', p.toFixed(4));
      preview.style.setProperty('--handoff-preview-y', `${((1 - p) * liftPx).toFixed(2)}px`);
      preview.style.setProperty('--handoff-preview-blur', `${((1 - p) * 8).toFixed(2)}px`);
      return p;
    },
    destroy() {
      preview.remove();
    }
  };
}
