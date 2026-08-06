import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { BELIEF_COPY } from '../../../story/copy';
import { assertPhoneMediaOwner } from '../../../story/media';
import { PatternBloomRenderer } from '../patternBloomRenderer';
import './PhonePattern.css';

assertPhoneMediaOwner('pattern-background', 'pattern');

const PATTERN_BACKGROUND_IMAGE = new URL(
  '../../../../../assets/pattern-background.webp', import.meta.url
).href;
const PATTERN_CENTER = Object.freeze({ x: 0.5, y: 0.28 });

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function waitForDecodedImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }
  if (typeof image.decode === 'function') return image.decode();
  return new Promise((resolve, reject) => {
    const finish = (complete: () => void) => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      complete();
    };
    const loaded = () => finish(resolve);
    const failed = () => finish(() => reject(new Error('Pattern image decode failed')));
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
  });
}

export function phonePatternFrame(rawProgress: number): Readonly<{
  progress: number;
  copyProgress: number;
  copyY: number;
  textureOpacity: number;
  washOpacity: number;
}> {
  const progress = clamp(rawProgress);
  const copyProgress = progress;
  return {
    progress,
    copyProgress,
    copyY: 44 * (1 - copyProgress),
    textureOpacity: 1 - progress,
    washOpacity: 0.54
  };
}

type PhonePatternMigrationControl = Readonly<{
  enter(animate?: boolean): void;
  leave(): void;
  reverse(animate?: boolean): void;
}>;

/** Temporary Task 7 bridge key. Task 11 removes this with the old formal shell. */
export const PHONE_PATTERN_MIGRATION_CONTROL: unique symbol = Symbol(
  'phone-pattern-migration-control'
);

export type PhonePatternMigrationCommands = PhoneLeafCommandHandle & Readonly<{
  [PHONE_PATTERN_MIGRATION_CONTROL]: PhonePatternMigrationControl;
}>;

export type PhonePatternProps = Readonly<{ reports: PhoneLeafReportPort }>;

/** One genuine Pattern leaf shared by the clean runtime and temporary old-formal bridge. */
export function PhonePattern({ reports }: PhonePatternProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PatternBloomRenderer | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const preparedRef = useRef(false);
  const reportedGenerationRef = useRef(0);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const disposedRef = useRef(false);

  const reportPrepared = useCallback(() => {
    const binding = bindingRef.current;
    const generation = generationRef.current;
    if (!preparedRef.current || !binding || disposedRef.current
      || reportedGenerationRef.current === generation) return;
    reportedGenerationRef.current = generation;
    binding.reports.reportPrepared('pattern-image', {
      kind: 'image-decoded',
      token: `pattern:prepared:${generation}`,
      ready: true,
      detail: { imageDecoded: true, rendererCompositeDrawn: true }
    });
  }, []);

  const render = useCallback((rawProgress: number) => {
    const frame = phonePatternFrame(rawProgress);
    rendererRef.current?.setFrameProgress(frame.progress, frame.progress);
    if (imageRef.current) imageRef.current.style.opacity = frame.textureOpacity.toFixed(4);
    if (copyRef.current) {
      copyRef.current.style.transform = `translate3d(0, ${frame.copyY.toFixed(4)}px, 0)`;
      copyRef.current.style.opacity = frame.copyProgress.toFixed(4);
    }
    if (washRef.current) washRef.current.style.opacity = frame.washOpacity.toFixed(4);
    rootRef.current?.style.setProperty('--phone-pattern-progress', frame.progress.toFixed(4));
  }, []);

  const commands = useMemo(() => {
    const commandHandle: PhonePatternMigrationCommands = {
      rebind(binding) {
        bindingRef.current = binding;
        generationRef.current += 1;
        reportedGenerationRef.current = 0;
        activeRef.current = true;
        rendererRef.current?.setRenderActive(true, true);
        reportPrepared();
      },
      activate(command): PhoneActivationInvocation {
        return {
          invocationId: command.invocationId,
          surfaceIds: command.surfaceIds,
          invoked: false,
          settlements: []
        };
      },
      render,
      settle() { render(0); },
      pause() {
        activeRef.current = false;
        rendererRef.current?.setRenderActive(false, false);
      },
      dispose() {
        activeRef.current = false;
        disposedRef.current = true;
        rendererRef.current?.destroy();
        rendererRef.current = null;
        bindingRef.current = null;
      },
      [PHONE_PATTERN_MIGRATION_CONTROL]: {
        enter(animate = true) {
          activeRef.current = true;
          rendererRef.current?.setRenderActive(true, animate);
        },
        leave() {
          commandHandle.pause('outside-closure');
        },
        reverse(animate = true) {
          activeRef.current = true;
          rendererRef.current?.setRenderActive(true, animate);
        }
      }
    };
    return Object.freeze(commandHandle);
  }, [render, reportPrepared]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!root || !image || !canvas) return;
    disposedRef.current = false;
    preparedRef.current = false;
    reportedGenerationRef.current = 0;
    render(0);
    const renderer = new PatternBloomRenderer(canvas, {
      centerForViewport: () => PATTERN_CENTER
    });
    rendererRef.current = renderer;
    canvas.dataset.portraitPatternRenderer = 'loading';
    canvas.dataset.portraitPatternCenter = '50%,28%';
    reports.registerMount({
      root,
      surfaces: [{ id: 'pattern-image', element: image, kind: 'image' }],
      commands
    });
    renderer.setRenderActive(activeRef.current, activeRef.current);
    let current = true;
    void Promise.all([
      waitForDecodedImage(image),
      renderer.start().then(() => renderer.prepareStaticFrame())
    ]).then(() => {
      if (!current || disposedRef.current || rendererRef.current !== renderer) return;
      preparedRef.current = true;
      canvas.dataset.portraitPatternRenderer = 'ready';
      root.dataset.phonePatternFrame = 'ready';
      reportPrepared();
    }, (error: unknown) => {
      if (!current || disposedRef.current || rendererRef.current !== renderer) return;
      canvas.dataset.portraitPatternRenderer = 'failed';
      bindingRef.current?.reports.reportFailure({
        code: 'pattern-frame-rejected',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
    });
    return () => {
      current = false;
      disposedRef.current = true;
      activeRef.current = false;
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = null;
      bindingRef.current = null;
      delete canvas.dataset.portraitPatternRenderer;
      delete canvas.dataset.portraitPatternCenter;
      delete root.dataset.phonePatternFrame;
    };
  }, [commands, render, reportPrepared, reports]);

  return (
    <section
      ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--pattern"
      aria-labelledby="portrait-spike-pattern-title"
      style={{ '--phone-pattern-progress': '0.0000' } as CSSProperties}
    >
      <div className="portrait-scroll-spike__pattern-motion" aria-hidden="true">
        <div className="portrait-scroll-spike__pattern-plate">
          <img
            ref={imageRef}
            className="portrait-scroll-spike__pattern-image"
            src={PATTERN_BACKGROUND_IMAGE}
            alt=""
          />
          <div ref={washRef} className="portrait-scroll-spike__pattern-wash" aria-hidden="true" />
        </div>
        <canvas
          ref={canvasRef}
          className="portrait-scroll-spike__pattern-bloom"
          data-portrait-pattern-bloom
          aria-hidden="true"
        />
      </div>
      <div ref={copyRef} className="portrait-scroll-spike__pattern-copy">
        <p>{BELIEF_COPY[0]}</p>
        <h2 id="portrait-spike-pattern-title">{BELIEF_COPY[1]}</h2>
        <p>{BELIEF_COPY[2]}</p>
      </div>
    </section>
  );
}

export default PhonePattern;
export const phoneSceneId = 'pattern' as const;
