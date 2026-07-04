import { timelineJoins, timelineScenes } from './scene-timeline-manifest.js';

const HUD_PARAM = 'timelineHud';
const HUD_STORAGE_KEY = 'timelineHud';
const HUD_ROOT_CLASS = 'scene-timeline-hud-active';
const MARKS_CLASS = 'scene-timeline-hud-marks';
const MAX_EVENTS = 8;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function getWindow(root) {
  return root?.defaultView || (typeof window !== 'undefined' ? window : null);
}

function getDocument(root) {
  return root?.nodeType === 9 ? root : root?.ownerDocument || document;
}

function isHudEnabled(root) {
  const runtimeWindow = getWindow(root);
  if (!runtimeWindow) return false;
  if (runtimeWindow.__SCENE_TIMELINE_HUD__ === true) return true;

  const params = new URLSearchParams(runtimeWindow.location?.search || '');
  if (params.get(HUD_PARAM) === '1') return true;
  if (params.get('hud') === 'timeline') return true;

  try {
    return runtimeWindow.localStorage?.getItem(HUD_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function formatProgress(value) {
  return Number.isFinite(value) ? clamp01(value).toFixed(3) : '-';
}

function getSceneSection(root, scene) {
  const selector = scene?.sectionSelector || scene?.sceneSelector;
  return selector ? root.querySelector(selector) : null;
}

function getSceneCopies(root, scene) {
  return (scene?.copySelectors || [])
    .flatMap((copy) => [...root.querySelectorAll(copy.selector)]);
}

function getActiveSection(root) {
  const viewportHeight = Math.max(1, getWindow(root)?.innerHeight || 1);
  const probeY = viewportHeight * 0.38;
  return [...root.querySelectorAll('[data-section-id]')]
    .map((section) => ({ section, rect: section.getBoundingClientRect() }))
    .find(({ rect }) => rect.top <= probeY && rect.bottom >= probeY)?.section || null;
}

function getHostProgress(host) {
  if (!host) return null;
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const rect = host.getBoundingClientRect();
  const span = Math.max(1, host.offsetHeight || rect.height || viewportHeight);
  return clamp01((viewportHeight - rect.top) / span);
}

function getNavBlurSnapshot(root) {
  const runtimeWindow = getWindow(root);
  const documentRef = getDocument(root);
  const edge = documentRef.querySelector('.scroll-edge-blur');
  const nav = documentRef.querySelector('.site-nav');
  if (!runtimeWindow || !edge) {
    return {
      height: 0,
      opacity: 0,
      visibility: 'missing',
      beforeDisplay: nav ? 'unknown' : 'missing',
      issues: ['nav blur missing']
    };
  }

  const style = runtimeWindow.getComputedStyle?.(edge);
  const beforeStyle = nav ? runtimeWindow.getComputedStyle?.(nav, '::before') : null;
  const height = edge.getBoundingClientRect?.().height || parseFloat(style?.height || '0') || 0;
  const opacity = parseFloat(style?.opacity || '0') || 0;
  const visibility = style?.visibility || '';
  const beforeDisplay = beforeStyle?.display || '';
  const issues = [];
  if (height > 0 && height < 48) issues.push(`nav blur thin ${Math.round(height)}px`);
  if (opacity > 0.01 && visibility !== 'visible') issues.push('nav blur hidden');
  if (opacity > 0.01 && beforeDisplay !== 'none') issues.push(`nav fallback ${beforeDisplay}`);

  return {
    height,
    opacity,
    visibility,
    beforeDisplay,
    issues
  };
}

function getJoinIssues({ frame, section, copies, presentCount }) {
  const issues = [];
  if (presentCount > 1) issues.push(`present x${presentCount}`);
  if (frame?.phase === 'presented' && section?.dataset?.sceneState !== 'presented') {
    issues.push('section not presented');
  }
  if (frame?.phase === 'presented' && section?.dataset?.sectionHandoffState !== 'presented') {
    issues.push('handoff not presented');
  }
  if (frame?.phase === 'presented' && copies.some((copy) => copy.dataset?.timelineFixed === 'true')) {
    issues.push('fixed copy after present');
  }
  return issues;
}

function createElement(documentRef, tag, className, text = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function makeSnapshot({ root, sceneTimeline, hosts, reduceMotion, events }) {
  const sceneById = new Map(timelineScenes.map((scene) => [scene.id, scene]));
  const hostByJoinId = new Map();
  hosts.forEach((host) => {
    const join = sceneTimeline?.getJoinForHost?.(host);
    if (join?.id && !hostByJoinId.has(join.id)) hostByJoinId.set(join.id, host);
  });

  const activeSection = getActiveSection(root);
  const navBlur = getNavBlurSnapshot(root);
  const eventCounts = events.reduce((counts, event) => {
    const joinId = event.detail?.joinId || '';
    counts.set(joinId, (counts.get(joinId) || 0) + 1);
    return counts;
  }, new Map());

  const joins = timelineJoins.map((join) => {
    const scene = sceneById.get(join.toScene);
    const section = getSceneSection(root, scene);
    const copies = getSceneCopies(root, scene);
    const frame = sceneTimeline?.getFrame?.(join.id) || null;
    const state = sceneTimeline?.getState?.(join.id) || null;
    const host = hostByJoinId.get(join.id) || null;
    const presentCount = eventCounts.get(join.id) || 0;
    const issues = getJoinIssues({ frame, section, copies, presentCount });

    return {
      id: join.id,
      drive: join.progressPolicy || host?.dataset?.transitionDrive || 'snap',
      hostProgress: getHostProgress(host),
      frame,
      state,
      sectionState: section?.dataset?.sceneState || '',
      handoffState: section?.dataset?.sectionHandoffState || '',
      copyState: copies.map((copy) => copy.dataset?.entryState || '').filter(Boolean).join(','),
      fixedCopies: copies.filter((copy) => copy.dataset?.timelineFixed === 'true').length,
      presentCount,
      issues
    };
  });

  return {
    scrollY: Math.round(getWindow(root)?.scrollY || 0),
    viewport: Math.round(getWindow(root)?.innerHeight || 0),
    reduceMotion: Boolean(reduceMotion),
    activeSection: activeSection?.dataset?.sectionId || activeSection?.id || '',
    navBlur,
    joins,
    events: events.slice(-MAX_EVENTS)
  };
}

function renderJoinRows(documentRef, rowsElement, snapshot) {
  rowsElement.replaceChildren();
  snapshot.joins.forEach((join) => {
    const frame = join.frame;
    const row = createElement(documentRef, 'div', `scene-timeline-hud__row${join.issues.length ? ' is-warn' : ''}`);
    row.innerHTML = `
      <div class="scene-timeline-hud__join-head">
        <span>${join.id}</span>
        <span>${join.drive}</span>
      </div>
      <div class="scene-timeline-hud__join-grid">
        <span>host ${formatProgress(join.hostProgress)}</span>
        <span>frame ${formatProgress(frame?.progress)}</span>
        <span>${frame?.phase || '-'}</span>
        <span>dir ${frame?.direction ?? '-'}</span>
        <span>copy ${frame?.copyOwner || '-'}</span>
        <span>sec ${join.sectionState || '-'}</span>
        <span>handoff ${join.handoffState || '-'}</span>
        <span>entry ${join.copyState || '-'}</span>
        <span>fixed ${join.fixedCopies}</span>
        <span>events ${join.presentCount}</span>
      </div>
      ${join.issues.length ? `<div class="scene-timeline-hud__issues">${join.issues.join(' / ')}</div>` : ''}
    `;
    rowsElement.append(row);
  });
}

function renderEvents(documentRef, eventsElement, snapshot) {
  eventsElement.replaceChildren();
  const recent = snapshot.events.slice(-MAX_EVENTS).reverse();
  if (!recent.length) {
    eventsElement.append(createElement(documentRef, 'div', 'scene-timeline-hud__event is-empty', 'no presented events'));
    return;
  }

  recent.forEach((event) => {
    const detail = event.detail || {};
    eventsElement.append(createElement(
      documentRef,
      'div',
      'scene-timeline-hud__event',
      `${event.time} ${detail.joinId || '-'} ${detail.reason || ''}`.trim()
    ));
  });
}

function applyMarks(root, enabled) {
  const rootElement = root.documentElement || document.documentElement;
  rootElement.classList.toggle(MARKS_CLASS, enabled);
}

export function initSceneTimelineHud({
  root = document,
  sceneTimeline = null,
  hosts = [],
  reduceMotion = false
} = {}) {
  if (!isHudEnabled(root) || !sceneTimeline) return null;

  const runtimeWindow = getWindow(root);
  const documentRef = getDocument(root);
  const rootElement = root.documentElement || document.documentElement;
  const events = [];
  let minimized = true;
  let marksEnabled = false;
  let raf = 0;
  let lastRender = 0;

  const hud = createElement(documentRef, 'aside', 'scene-timeline-hud');
  const header = createElement(documentRef, 'div', 'scene-timeline-hud__header');
  const title = createElement(documentRef, 'strong', '', 'Timeline HUD');
  const controls = createElement(documentRef, 'div', 'scene-timeline-hud__controls');
  const markButton = createElement(documentRef, 'button', '', 'Marks');
  const copyButton = createElement(documentRef, 'button', '', 'Copy');
  const minButton = createElement(documentRef, 'button', '', 'Open');
  const meta = createElement(documentRef, 'div', 'scene-timeline-hud__meta');
  const rows = createElement(documentRef, 'div', 'scene-timeline-hud__rows');
  const eventLog = createElement(documentRef, 'div', 'scene-timeline-hud__events');

  markButton.type = 'button';
  copyButton.type = 'button';
  minButton.type = 'button';
  controls.append(markButton, copyButton, minButton);
  header.append(title, controls);
  hud.append(header, meta, rows, eventLog);
  documentRef.body.append(hud);
  hud.classList.add('is-minimized');
  rootElement.classList.add(HUD_ROOT_CLASS);

  const render = (force = false) => {
    const now = performance.now();
    if (!force && now - lastRender < 100) return;
    lastRender = now;

    const snapshot = makeSnapshot({ root, sceneTimeline, hosts, reduceMotion, events });
    const issueCount = snapshot.joins.filter((join) => join.issues.length).length + snapshot.navBlur.issues.length;
    meta.textContent = [
      `scroll ${snapshot.scrollY}`,
      `section ${snapshot.activeSection || '-'}`,
      `blur h${Math.round(snapshot.navBlur.height)} o${formatNumber(snapshot.navBlur.opacity, 2)} ${snapshot.navBlur.beforeDisplay || '-'}`,
      `warn ${issueCount}`,
      `events ${events.length}`
    ].join(' | ');

    if (!minimized) {
      renderJoinRows(documentRef, rows, snapshot);
      renderEvents(documentRef, eventLog, snapshot);
    }

    runtimeWindow.__sceneTimelineHudSnapshot = snapshot;
  };

  const tick = () => {
    render();
    raf = runtimeWindow.requestAnimationFrame(tick);
  };

  const onPresented = (event) => {
    events.push({
      time: formatNumber(performance.now() / 1000, 2),
      detail: { ...(event.detail || {}) }
    });
    if (events.length > 80) events.splice(0, events.length - 80);
    render(true);
  };

  markButton.addEventListener('click', () => {
    marksEnabled = !marksEnabled;
    markButton.classList.toggle('is-active', marksEnabled);
    applyMarks(root, marksEnabled);
  });

  copyButton.addEventListener('click', async () => {
    const snapshot = makeSnapshot({ root, sceneTimeline, hosts, reduceMotion, events });
    const text = JSON.stringify(snapshot, null, 2);
    try {
      await runtimeWindow.navigator.clipboard.writeText(text);
      copyButton.textContent = 'Copied';
      runtimeWindow.setTimeout(() => { copyButton.textContent = 'Copy'; }, 900);
    } catch {
      runtimeWindow.__sceneTimelineHudSnapshot = snapshot;
      copyButton.textContent = 'Saved';
      runtimeWindow.setTimeout(() => { copyButton.textContent = 'Copy'; }, 900);
    }
  });

  minButton.addEventListener('click', () => {
    minimized = !minimized;
    hud.classList.toggle('is-minimized', minimized);
    minButton.textContent = minimized ? 'Open' : 'Min';
    render(true);
  });

  root.addEventListener('scene-timeline:presented', onPresented);
  raf = runtimeWindow.requestAnimationFrame(tick);
  render(true);

  return {
    destroy() {
      runtimeWindow.cancelAnimationFrame(raf);
      root.removeEventListener('scene-timeline:presented', onPresented);
      applyMarks(root, false);
      rootElement.classList.remove(HUD_ROOT_CLASS);
      hud.remove();
      delete runtimeWindow.__sceneTimelineHudSnapshot;
    }
  };
}
