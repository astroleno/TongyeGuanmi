const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const COPY_CANDIDATES = [
  ['hero', '#home .hero-content'],
  ['belief', '#belief .belief-copy-wrap'],
  ['method', '#method .method-edition-layout'],
  ['brand', '#brand .brand-definition-grid'],
  ['services', '#services .enterprise-vertical-layout'],
  ['lab', '#lab .scenario-wide-stage'],
  ['education', '#education .education-vertical-layout'],
  ['philosophy', '#philosophy .philosophy-list'],
  ['contact', '#contact .contact-endpoint']
];

function viewportArea(element, win) {
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
  return width * height;
}

function isVisible(element, win) {
  if (!element || viewportArea(element, win) <= 0) return false;
  const style = win.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.03;
}

function basename(value = '') {
  const clean = String(value).split('?')[0].split('#')[0];
  return clean.slice(clean.lastIndexOf('/') + 1) || 'video';
}

function summarizeElement(element, fallback = 'unknown') {
  if (!element) return fallback;
  return element.dataset?.sectionId
    || element.dataset?.transitionId
    || element.id
    || String(element.className || '').split(/\s+/).filter(Boolean)[0]
    || fallback;
}

function pickVisibleElement(elements, win) {
  let best = null;
  let bestArea = 0;
  for (const element of elements) {
    if (!isVisible(element, win)) continue;
    const area = viewportArea(element, win);
    if (area > bestArea) {
      best = element;
      bestArea = area;
    }
  }
  return best;
}

function collectSections(doc) {
  return [
    doc.getElementById('home'),
    ...doc.querySelectorAll('section[data-section-id]')
  ].filter(Boolean);
}

function collectTransitions(doc) {
  return [...doc.querySelectorAll('.chapter-transition[data-transition-id], .scene-transition[data-transition-id]')];
}

function summarizeVideos(doc, win) {
  const visibleVideos = [...doc.querySelectorAll('video')]
    .filter((video) => isVisible(video, win))
    .map((video) => {
      const state = video.paused ? 'paused' : 'play';
      const time = Number(video.currentTime || 0).toFixed(2);
      return `${basename(video.currentSrc || video.src)}:${time}:${state}`;
    });
  return visibleVideos.length ? visibleVideos.slice(0, 4).join(' | ') : 'none';
}

function summarizeCopy(doc, win) {
  const visibleCopies = COPY_CANDIDATES
    .filter(([, selector]) => isVisible(doc.querySelector(selector), win))
    .map(([label]) => label);
  return visibleCopies.length ? visibleCopies.join(' + ') : 'none';
}

function summarizeScrollTriggers(win) {
  try {
    const triggers = win.ScrollTrigger?.getAll?.();
    if (!Array.isArray(triggers)) return 'unavailable';
    const active = triggers
      .filter((trigger) => trigger?.isActive || (trigger?.progress > 0 && trigger.progress < 1))
      .slice(0, 4)
      .map((trigger) => {
        const label = summarizeElement(trigger.trigger || trigger.pin, 'trigger');
        return `${label}:${Number(trigger.progress || 0).toFixed(3)}`;
      });
    return active.length ? active.join(' | ') : 'idle';
  } catch {
    return 'unavailable';
  }
}

function fieldMap(hud) {
  return [...hud.querySelectorAll('[data-master-observer-field]')]
    .reduce((fields, element) => {
      fields[element.dataset.masterObserverField] = element;
      return fields;
    }, {});
}

function setField(fields, name, value) {
  if (fields[name]) fields[name].textContent = value;
}

export function startHomepageMasterObserver({ root = document, mode = 'calibrate' } = {}) {
  const doc = root.nodeType === Node.DOCUMENT_NODE ? root : document;
  const win = doc.defaultView || window;
  const html = doc.documentElement;
  const hud = doc.querySelector('[data-master-observer-hud]');
  if (!hud) return { destroy() {} };

  const fields = fieldMap(hud);
  const markerButton = hud.querySelector('[data-master-observer-marker]');
  let previousScrollY = win.scrollY || win.pageYOffset || 0;
  let direction = 'forward';
  let markerCount = 0;
  let frameId = 0;
  let destroyed = false;

  html.dataset.masterObserver = mode;
  if (mode === 'experiment') html.dataset.masterExperiment = 'true';
  else html.dataset.timelineCalibrationHud = 'true';

  hud.hidden = false;
  hud.removeAttribute('inert');
  hud.setAttribute('aria-hidden', 'false');
  setField(fields, 'mode', mode);

  function mark() {
    markerCount += 1;
    setField(fields, 'marker', `${markerCount} @ ${Math.round(win.scrollY || 0)}px`);
  }

  function update() {
    if (destroyed) return;
    const scrollY = win.scrollY || win.pageYOffset || 0;
    if (Math.abs(scrollY - previousScrollY) > 0.5) {
      direction = scrollY > previousScrollY ? 'forward' : 'reverse';
      previousScrollY = scrollY;
    }

    const maxScrollY = Math.max(1, doc.documentElement.scrollHeight - win.innerHeight);
    const section = pickVisibleElement(collectSections(doc), win);
    const transition = pickVisibleElement(collectTransitions(doc), win);
    const transitionLabel = transition
      ? `${transition.dataset.transitionId || 'transition'}:${transition.dataset.transitionModule || 'unknown'}`
      : 'none';
    const component = transition
      ? transition.dataset.transitionModule || transition.dataset.transitionId || 'transition'
      : summarizeElement(section, 'none');

    setField(fields, 'section', summarizeElement(section, 'none'));
    setField(fields, 'transition', transitionLabel);
    setField(fields, 'scroll', `${Math.round(scrollY)}px / ${(clamp(scrollY / maxScrollY) * 100).toFixed(1)}%`);
    setField(fields, 'direction', direction);
    setField(fields, 'component', component);
    setField(fields, 'videos', summarizeVideos(doc, win));
    setField(fields, 'copy', summarizeCopy(doc, win));
    setField(fields, 'scrolltrigger', summarizeScrollTriggers(win));

    frameId = win.requestAnimationFrame(update);
  }

  markerButton?.addEventListener('click', mark);
  frameId = win.requestAnimationFrame(update);

  return {
    destroy() {
      destroyed = true;
      if (frameId) win.cancelAnimationFrame(frameId);
      markerButton?.removeEventListener('click', mark);
      hud.hidden = true;
      hud.setAttribute('inert', '');
      hud.setAttribute('aria-hidden', 'true');
    }
  };
}
