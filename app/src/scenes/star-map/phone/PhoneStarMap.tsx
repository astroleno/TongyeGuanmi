import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { initStarFieldReveal, type StarFieldCamera, type StarFieldReveal } from '../starFieldReveal';
import { BELIEF_COPY, STAR_MAP_TITLE } from '../../../story/copy';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import './PhoneStarMap.css';

const STAR_MAP_IMAGE = phoneMediaUrlFor('star-map-source', 'star-map');
const STAR_MAP_HIGHLIGHT_MASK = phoneMediaUrlFor('star-map-highlight-mask', 'star-map');
const FRAME_INTERVAL_MS = 1000 / 12;
const PHONE_STAR_CAMERA: StarFieldCamera = Object.freeze({ rotationDegrees: -90, zoom: 1 });
const STAR_MAP_AMBIENT_PERIOD_SECONDS = 4.4;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function waitForDecodedImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let pollId: number | undefined;
    const clear = () => {
      if (pollId !== undefined) window.clearTimeout(pollId);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const failed = () => { clear(); reject(new Error('Star Map source decode failed')); };
    const loaded = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        clear();
        resolve();
      }
    };
    const poll = () => {
      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        loaded();
        return;
      }
      pollId = window.setTimeout(poll, 50);
    };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    poll();
  });
}

export function phoneStarMapFrame(rawProgress: number): Readonly<{
  progress: number; opacity: number; y: number; washOpacity: number;
}> {
  const progress = clamp(rawProgress);
  return { progress, opacity: progress, y: 18 * (1 - progress), washOpacity: progress };
}

/** Keeps the source plate fixed while the extracted Perlin glow visibly breathes. */
export function phoneStarMapAmbientLayer(
  timeSeconds: number,
  reducedMotion: boolean
): Readonly<{ strength: number; noiseFloor: number }> {
  if (reducedMotion) return { strength: .72, noiseFloor: .02 };
  const breathing = Math.sin(timeSeconds * Math.PI * 2 / STAR_MAP_AMBIENT_PERIOD_SECONDS);
  return {
    strength: 1.1 + breathing * .44,
    noiseFloor: .035 + (breathing + 1) * .12
  };
}

type PhoneStarMapMigrationControl = Readonly<{
  enter(): void; leave(): void; reverse(): void;
}>;

/** Temporary Task 7 bridge key. Task 11 removes it with the old formal shell. */
export const PHONE_STAR_MAP_MIGRATION_CONTROL: unique symbol = Symbol(
  'phone-star-map-migration-control'
);
export type PhoneStarMapMigrationCommands = PhoneLeafCommandHandle & Readonly<{
  [PHONE_STAR_MAP_MIGRATION_CONTROL]: PhoneStarMapMigrationControl;
}>;

export function PhoneStarMap({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
  const rootRef = useRef<HTMLElement | null>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const revealRef = useRef<StarFieldReveal | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const readyFrameRef = useRef(0);
  const liveFrameRef = useRef(0);
  const lastPaintedAtRef = useRef(-Infinity);
  const revisionRef = useRef(0);
  const firstFramePaintedRef = useRef(false);
  const sourceReadyRef = useRef(false);
  const reportedTokenRef = useRef<string | null>(null);
  const reportedSourceTokenRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const disposedRef = useRef(false);

  const reportCurrentFrame = useCallback(() => {
    const binding = bindingRef.current;
    if (!binding || !sourceReadyRef.current || !firstFramePaintedRef.current || disposedRef.current
      || reportedTokenRef.current === binding.frameToken) return;
    reportedTokenRef.current = binding.frameToken;
    binding.reports.reportFrame('star-map-canvas', {
      kind: 'frame', token: binding.frameToken, presented: true,
      frameId: `star-map:${revisionRef.current}`,
      detail: {
        sourceDrawn: false, staticSource: true, sourceDecoded: true,
        camera: 'rotate(-90deg) cover'
      }
    });
  }, []);

  const reportSourcePrepared = useCallback(() => {
    const binding = bindingRef.current;
    if (!binding || !sourceReadyRef.current || disposedRef.current
      || reportedSourceTokenRef.current === binding.frameToken) return;
    reportedSourceTokenRef.current = binding.frameToken;
    binding.reports.reportPrepared('star-map-source', {
      kind: 'image-decoded', token: `star-map:source:${binding.frameToken}`,
      ready: true, detail: { sourceDecoded: true }
    });
  }, []);

  const paint = useCallback((now = performance.now(), force = false): boolean => {
    const reveal = revealRef.current;
    const canvas = canvasRef.current;
    if (!reveal?.ready || !canvas || disposedRef.current
      || (!force && now - lastPaintedAtRef.current < FRAME_INTERVAL_MS)) return false;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const seconds = now / 1000;
    const ambient = phoneStarMapAmbientLayer(seconds, reducedMotion);
    reveal.renderBackground({
      timeSeconds: seconds,
      strength: ambient.strength,
      noiseFloor: ambient.noiseFloor,
      camera: PHONE_STAR_CAMERA,
      drawSource: false
    });
    firstFramePaintedRef.current = true;
    lastPaintedAtRef.current = now;
    revisionRef.current += 1;
    canvas.dataset.portraitStarPerlin = 'ready';
    canvas.dataset.portraitStarCamera = 'rotate(-90deg) cover';
    canvas.dataset.portraitStarPerlinRevision = String(revisionRef.current);
    reportCurrentFrame();
    return true;
  }, [reportCurrentFrame]);

  const stopAmbient = useCallback(() => {
    window.cancelAnimationFrame(liveFrameRef.current);
    liveFrameRef.current = 0;
  }, []);
  const startAmbient = useCallback(() => {
    if (!activeRef.current || liveFrameRef.current
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const tick = (time: number) => {
      liveFrameRef.current = 0;
      if (!activeRef.current || disposedRef.current) return;
      paint(time);
      liveFrameRef.current = window.requestAnimationFrame(tick);
    };
    liveFrameRef.current = window.requestAnimationFrame(tick);
  }, [paint]);

  const syncAmbientOwnership = useCallback(() => {
    const shell = rootRef.current?.closest<HTMLElement>('.phone-story');
    const stable = shell?.dataset.phoneStatus === 'stable'
      && shell.dataset.phoneScene === 'star-map';
    activeRef.current = stable;
    if (stable) startAmbient();
    else stopAmbient();
  }, [startAmbient, stopAmbient]);

  const render = useCallback((rawProgress: number) => {
    const frame = phoneStarMapFrame(rawProgress);
    if (canvasRef.current) {
      canvasRef.current.dataset.portraitStarPerlinProgress = frame.progress.toFixed(4);
    }
    if (washRef.current) washRef.current.style.opacity = frame.washOpacity.toFixed(4);
    if (copyRef.current) {
      copyRef.current.style.transform = `translate3d(0, ${frame.y.toFixed(4)}px, 0)`;
      copyRef.current.style.opacity = frame.opacity.toFixed(4).replace(/\.0+$/, '');
    }
  }, []);

  const commands = useMemo(() => {
    const handle: PhoneStarMapMigrationCommands = {
      rebind(binding) {
        bindingRef.current = binding;
        reportedTokenRef.current = null;
        reportedSourceTokenRef.current = null;
        reportSourcePrepared();
        reportCurrentFrame();
      },
      activate(command): PhoneActivationInvocation {
        return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
          invoked: false, settlements: [] };
      },
      render,
      settle() { render(1); },
      pause() { activeRef.current = false; stopAmbient(); },
      dispose() {
        disposedRef.current = true;
        activeRef.current = false;
        stopAmbient();
        window.cancelAnimationFrame(readyFrameRef.current);
        revealRef.current?.dispose();
        revealRef.current = null;
        bindingRef.current = null;
      },
      [PHONE_STAR_MAP_MIGRATION_CONTROL]: {
        enter() { activeRef.current = true; render(1); startAmbient(); },
        leave() { handle.pause('outside-closure'); },
        reverse() { activeRef.current = true; render(1); startAmbient(); }
      }
    };
    return Object.freeze(handle);
  }, [paint, render, reportCurrentFrame, startAmbient, stopAmbient]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const source = sourceRef.current;
    const canvas = canvasRef.current;
    if (!root || !source || !canvas) return;
    disposedRef.current = false;
    sourceReadyRef.current = false;
    firstFramePaintedRef.current = false;
    reportedTokenRef.current = null;
    reportedSourceTokenRef.current = null;
    revisionRef.current = 0;
    render(0);
    const reveal = initStarFieldReveal({
      canvas, sourceUrl: STAR_MAP_HIGHLIGHT_MASK, autoplay: false,
      viewport: () => {
        const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        return {
          width: (canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth) * scale,
          height: (canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight) * scale
        };
      },
      config: {
        revealDurationMs: 2800, loopTransitionMs: 1200, noiseMaskWidth: 420,
        highlight: { threshold: 120, gamma: 3.05, softness: 23 },
        glow: { wideBlur: 120, mediumBlur: 44, coreBlur: 10, screenBlur: 3,
          wideAlpha: 1.38, mediumAlpha: 1.2, coreAlpha: .78, screenAlpha: .64 },
        noise: { profile: 'desktop-r5', seed: 42.7, scale: 3.8, warpScale: 2.1,
          warpAmount: .42, phaseSpeed: .66, driftX: .10, driftY: .46,
          warpSpeedX: .14, warpSpeedY: .12, octaves: 4, lacunarity: 2.07,
          gain: .51, ridgeMix: .17, thresholdLow: .45, thresholdHigh: .55 }
      }
    });
    revealRef.current = reveal;
    reports.registerMount({
      root, surfaces: [
        { id: 'star-map-source', element: source, kind: 'image' },
        { id: 'star-map-canvas', element: canvas, kind: 'canvas-2d' }
      ],
      commands
    });
    const awaitReady = (time: number) => {
      readyFrameRef.current = 0;
      if (disposedRef.current) return;
      if (!sourceReadyRef.current || !reveal.ready) {
        readyFrameRef.current = window.requestAnimationFrame(awaitReady);
        return;
      }
      paint(time, true);
    };
    void waitForDecodedImage(source).then(() => {
      if (disposedRef.current) return;
      sourceReadyRef.current = true;
      reportSourcePrepared();
      if (!readyFrameRef.current) readyFrameRef.current = window.requestAnimationFrame(awaitReady);
    }, (error: unknown) => {
      if (!disposedRef.current) bindingRef.current?.reports.reportFailure({
        code: 'star-map-source-decode-rejected',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
    });
    readyFrameRef.current = window.requestAnimationFrame(awaitReady);
    const shell = root.closest<HTMLElement>('.phone-story');
    const observer = shell && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(syncAmbientOwnership) : null;
    observer?.observe(shell!, {
      attributes: true, attributeFilter: ['data-phone-status', 'data-phone-scene']
    });
    syncAmbientOwnership();
    return () => {
      disposedRef.current = true;
      activeRef.current = false;
      sourceReadyRef.current = false;
      window.cancelAnimationFrame(readyFrameRef.current);
      stopAmbient();
      observer?.disconnect();
      reveal.dispose();
      if (revealRef.current === reveal) revealRef.current = null;
      bindingRef.current = null;
      sourceRef.current = null;
      delete canvas.dataset.portraitStarPerlin;
      delete canvas.dataset.portraitStarCamera;
      delete canvas.dataset.portraitStarPerlinRevision;
      delete canvas.dataset.portraitStarPerlinProgress;
    };
  }, [commands, paint, render, reportSourcePrepared, reports, startAmbient, stopAmbient]);

  return (
    <section ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--star"
      aria-labelledby="portrait-spike-star-title">
      <div className="portrait-scroll-spike__star-motion" aria-hidden="true">
        <img ref={sourceRef} className="portrait-scroll-spike__star-source" data-portrait-star-source
          src={STAR_MAP_IMAGE} alt="" aria-hidden="true" />
        <canvas ref={canvasRef} className="portrait-scroll-spike__star-perlin"
          data-portrait-star-perlin aria-hidden="true" />
      </div>
      <div ref={washRef} className="portrait-scroll-spike__star-wash" aria-hidden="true" />
      <div ref={copyRef} className="portrait-scroll-spike__star-copy">
        <h2 id="portrait-spike-star-title">{STAR_MAP_TITLE}</h2>
        <p>{BELIEF_COPY[3]}</p>
      </div>
    </section>
  );
}

export default PhoneStarMap;
export const phoneSceneId = 'star-map' as const;
