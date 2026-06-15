export function initRoute2MetalHome() {
  const loadShader = () => {
    import('../../previews/tongye-liquid-glass-2-metal-edge/metal-edge.js?home')
      .catch((error) => console.warn('Route2 metal edge shader unavailable.', error));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadShader, { once: true });
  } else {
    window.requestAnimationFrame(loadShader);
  }
}
