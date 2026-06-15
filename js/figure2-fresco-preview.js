const root = document.querySelector('[data-fresco-root]');
const video = document.querySelector('.fresco-figure-video');
const controls = Array.from(document.querySelectorAll('[data-fresco-var]'));
const resetButton = document.querySelector('[data-reset]');

const defaults = new Map(controls.map((control) => [control.dataset.frescoVar, control.value]));

initVideo();
initControls();

function initVideo() {
  if (!video) return;

  const useAlpha = shouldUseAlphaVideo();
  const source = useAlpha ? video.dataset.alphaSrc : video.dataset.fallbackSrc;

  document.body.classList.toggle('fresco-alpha-video', useAlpha);
  document.body.classList.toggle('fresco-mp4-video', !useAlpha);

  if (source) {
    video.src = source;
  }

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  const startVideo = () => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        video.pause();
      });
    }
  };

  if (video.readyState >= 2) {
    startVideo();
  } else {
    video.addEventListener('canplay', startVideo, { once: true });
  }
}

function initControls() {
  controls.forEach((control) => {
    updateControl(control);
    control.addEventListener('input', () => updateControl(control));
  });

  resetButton?.addEventListener('click', () => {
    controls.forEach((control) => {
      control.value = defaults.get(control.dataset.frescoVar) || control.defaultValue;
      updateControl(control);
    });
  });
}

function updateControl(control) {
  const value = Number(control.value);
  const cssName = `--${control.dataset.frescoVar}`;
  root?.style.setProperty(cssName, String(value));
  document.body.style.setProperty(cssName, String(value));

  const output = control.closest('.fresco-control')?.querySelector('output');
  if (output) {
    output.textContent = `${Math.round(value * 100)}%`;
  }
}

function shouldUseAlphaVideo() {
  if (new URLSearchParams(window.location.search).has('mp4')) return false;

  const probe = document.createElement('video');
  const canPlayVp9 = probe.canPlayType('video/webm; codecs="vp9"');
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

  return Boolean(canPlayVp9) && !isSafari;
}
