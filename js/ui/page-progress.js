const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function initPageProgress({ root = document.documentElement } = {}) {
  const update = () => {
    const doc = document.documentElement;
    const total = Math.max(1, doc.scrollHeight - window.innerHeight);
    const progress = clamp(window.scrollY / total, 0, 1);
    root.style.setProperty('--page-progress', progress.toFixed(4));
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  return {
    update,
    destroy() {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    }
  };
}
