import { initHomepageTransitions } from '../transitions/homepage-transition-runtime.js';

let observerScheduled = false;

function getObserverMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('master') === 'timeline') return 'experiment';
  if (params.get('calibrate') === 'timeline') return 'calibrate';
  return '';
}

function waitForLoaderHidden(body) {
  if (body.classList.contains('is-loader-hidden') || !document.querySelector('.loading-screen')) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.addEventListener('site:loader-hidden', resolve, { once: true });
  });
}

function scheduleObserver({ root, body, transitionsReady }) {
  const mode = getObserverMode();
  if (!mode || observerScheduled) return;
  observerScheduled = true;
  root.dataset.masterObserver = mode;
  if (mode === 'experiment') root.dataset.masterExperiment = 'true';
  else root.dataset.timelineCalibrationHud = 'true';

  Promise.allSettled([transitionsReady, waitForLoaderHidden(body)])
    .then(async () => {
      const { startHomepageMasterObserver } = await import('./homepage-master-observer.js');
      const observer = startHomepageMasterObserver({ root: document, mode });
      window.addEventListener('pagehide', () => observer?.destroy?.(), { once: true });
    })
    .catch((error) => {
      console.warn('Homepage master observer failed to start.', error);
    });
}

export function initHomepageTransitionsWithObserver({ root, body = document.body, ...options }) {
  let transitionsReady;
  try {
    transitionsReady = Promise.resolve(initHomepageTransitions({ root: document, ...options }));
  } catch (error) {
    transitionsReady = Promise.reject(error);
  }
  scheduleObserver({ root, body, transitionsReady });
  return transitionsReady;
}
