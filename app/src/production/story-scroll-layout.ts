import { canonicalSceneIds } from '../story/canonical-spine';
import { createScrollSpine, locateScrollPosition,
  scrollReadingScenes, type ScrollPosition, type ScrollSceneId, type ScrollSpine } from '../story/scroll-spine';
import { captureScrollTextBookmark, remapScrollAnchor, restoreScrollTextBookmark, type ScrollTextBookmark } from './story-scroll-restoration';

export function createStoryScrollLayout(root: HTMLElement, changed: (index: ScrollSpine, restored: number, revision: number) => void) {
  const surfaces = new Map<ScrollSceneId, HTMLElement>();
  const slots = new Map<ScrollSceneId, HTMLElement>();
  for (const scene of canonicalSceneIds) {
    const slot = root.querySelector<HTMLElement>(`[data-scroll-slot="${scene}"]`);
    const surface = slot?.querySelector<HTMLElement>('[data-scroll-content]');
    if (slot && surface) { slots.set(scene, slot); surfaces.set(scene, surface); }
  }
  let width = window.innerWidth;
  let height = window.innerHeight;
  let revision = 0;
  let position: ScrollPosition | null = null;
  let bookmark: ScrollTextBookmark | null = null;
  let bookmarkedScroll = Number.NaN;
  const platform = root.dataset.scrollPlatform === 'phone' ? 'phone' : 'desktop';
  let index = createScrollSpine({ viewportHeight: height, platform });
  let disposed = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  const measure = () => {
    if (disposed) return;
    const previous = position;
    const viewportChanged = window.innerWidth !== width || !coarse.matches && window.innerHeight !== height;
    if (viewportChanged) { width = window.innerWidth; height = window.innerHeight; }
    root.style.setProperty('--story-height', `${height}px`);
    root.style.setProperty('--phone-layout-height', `${height}px`);
    root.style.setProperty('--phone-visual-height', `${window.innerHeight}px`);
    root.style.setProperty('--phone-layout-width', `${width}px`);
    root.style.setProperty('--phone-visual-width', `${width}px`);
    const contentHeights: Partial<Record<ScrollSceneId, number>> = {};
    for (const [scene, surface] of surfaces) {
      if (scrollReadingScenes.has(scene)) contentHeights[scene] = Math.max(height, surface.scrollHeight, surface.offsetHeight);
    }
    const next = createScrollSpine({ viewportHeight: height, contentHeights, reducedMotion: reduced.matches, platform });
    const different = viewportChanged || index.reducedMotion !== next.reducedMotion
      || next.scenes.some((scene, i) => scene.contentHeight !== index.scenes[i]?.contentHeight);
    index = next;
    for (const scene of index.scenes) {
      const slot = slots.get(scene.scene);
      if (slot) { slot.style.height = `${scene.end - scene.start}px`; slot.dataset.scrollStart = String(scene.start); }
    }
    // WebKit truncates the native scroll limit. Round only the terminal document
    // extent up so native scrolling can reach the final logical landmark.
    root.style.minHeight = `${Math.ceil(index.totalHeight)}px`;
    if (different || revision === 0) {
      revision += 1;
      const textY = previous?.kind === 'hold'
        ? restoreScrollTextBookmark(bookmark, surfaces.get(previous.scene) ?? null, index) : null;
      const restored = textY ?? (previous ? remapScrollAnchor(index, previous) : window.scrollY);
      changed(index, restored, revision);
    }
  };
  const observer = new ResizeObserver(measure);
  for (const [scene, surface] of surfaces) if (scrollReadingScenes.has(scene)) observer.observe(surface);
  window.addEventListener('resize', measure, { passive: true });
  reduced.addEventListener('change', measure);
  const fonts = document.fonts;
  void fonts?.ready.then(() => measure());
  const paint = (next: ScrollPosition) => {
    const moved = position?.rangeId !== next.rangeId || position.scroll !== next.scroll;
    position = next;
    for (const entry of index.scenes) {
      const surface = surfaces.get(entry.scene);
      if (!surface) continue;
      const active = entry.scene === next.scene || entry.scene === next.target;
      const role = !active ? 'off' : next.kind === 'hold' ? 'hold' : entry.scene === next.scene ? 'source' : 'target';
      if (surface.dataset.scrollRole !== role) {
        surface.dataset.scrollRole = role;
        // Both sides of an ink transition are viewport-sized mask surfaces.
        // Freeze outgoing reading at its bottom inside that viewport; moving
        // the entire surface would move the mask and expose a dark gap.
        const readingTransition = (role === 'source' || role === 'target') && scrollReadingScenes.has(entry.scene);
        surface.style.height = readingTransition ? 'var(--story-height)' : '';
        surface.style.overflow = readingTransition ? 'hidden' : '';
        surface.style.position = role === 'hold' && scrollReadingScenes.has(entry.scene) ? 'relative' : 'fixed';
        surface.style.top = '0px';
        surface.style.visibility = active ? 'visible' : 'hidden';
        surface.inert = !active;
        surface.setAttribute('aria-hidden', String(!active));
        surface.style.opacity = active && role !== 'target' ? '1' : '0';
        surface.style.clipPath = 'none';
        surface.style.maskImage = 'none';
      }
      // A late font/content measurement can change the outgoing bottom pose
      // without changing its role.
      surface.scrollTop = role === 'source' && scrollReadingScenes.has(entry.scene)
        ? entry.contentHeight - height : 0;
      surface.style.top = '0px';
      if (role === 'hold' && index.reducedMotion && scrollReadingScenes.has(entry.scene)) {
        const atBottom = next.readingOffset > entry.contentHeight - height;
        surface.style.position = atBottom ? 'fixed' : 'relative';
        surface.style.top = atBottom ? `${height - entry.contentHeight}px` : '0px';
      }
    }
    root.dataset.scrollReducedMotion = String(index.reducedMotion);
    // Explicit seeks paint the semantic position before moving the document.
    // Refresh once that native scroll lands, even if the range did not change.
    if (moved || bookmarkedScroll !== window.scrollY) {
      bookmark = captureScrollTextBookmark(surfaces.get(next.scene) ?? null, next, height);
      bookmarkedScroll = window.scrollY;
    }
    root.dataset.scrollRange = next.rangeId;
    root.dataset.scrollProgress = next.progress.toFixed(5);
    root.dataset.scrollScene = next.scene;
    root.dataset.phoneScene = next.scene;
    if (next.segment) root.dataset.phoneSegment = next.segment;
    else delete root.dataset.phoneSegment;
  };
  return Object.freeze({
    measure, paint,
    getIndex: () => index,
    getRevision: () => revision,
    locate: (y: number) => locateScrollPosition(index, y),
    layer: (scene: ScrollSceneId) => surfaces.get(scene) ?? null,
    dispose() { disposed = true; observer.disconnect(); window.removeEventListener('resize', measure); reduced.removeEventListener('change', measure); }
  });
}

export type StoryScrollLayout = ReturnType<typeof createStoryScrollLayout>;
