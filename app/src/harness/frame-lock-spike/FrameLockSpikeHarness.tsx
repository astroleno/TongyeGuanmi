import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  mediaTimeForFrame,
  progressForFrameIndex,
  type SpikeVideoFrameMap
} from './spike-frame-map';
import {
  createStrictVideoProbe,
  type StrictVideoProbe,
  type StrictVideoProbeCapability,
  type StrictVideoProbeReceipt
} from './strict-video-probe';
import {
  createStrictPackedProbe,
  type StrictPackedProbe
} from './strict-packed-probe';
import {
  createSpikeFrameBarrier,
  type SpikeFrameBarrier,
  type SpikeFrameBarrierReceipt
} from './spike-frame-barrier';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface
} from '../../media/phone-packed-alpha-surface';
import './FrameLockSpikeHarness.css';

// The harness reads the same allowlist as the media verification scripts. It
// is deliberately kept on the disposable route; production modules never
// import this file.
// @ts-expect-error The script-side contract is JavaScript without a declaration file.
import * as mediaContractModule from '../../../scripts/homepage-media-contract.mjs';

type MediaContractModule = Readonly<{
  animationWebmSources: readonly string[];
  animationHevcAlphaSources: readonly string[];
  packedAlphaVideoSources: readonly string[];
  canonicalVideoContracts: readonly Readonly<{
    source: string;
    fps: string;
    frames: number;
    firstPts: number;
  }>[];
}>;

const mediaContract = mediaContractModule as unknown as MediaContractModule;

export type FrameLockSurface = 'desktop-ph' | 'phone-ph' | 'phone-crane' | 'asset';
export type FrameLockSequence = 'forward' | 'reverse' | 'endpoints' | 'random' | 'pressure';
export type FrameLockSpikeStatus = 'booting' | 'ready' | 'static-fallback' | 'error';

export type FrameLockSpikeReceiptRow = Readonly<{
  status: StrictVideoProbeReceipt['status'];
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  frameLag: number;
  evidence: 'video-frame-callback' | 'packed-canvas-draw' | 'packed-frame-barrier' | 'none';
  seekToPresentMs: number;
  committed: boolean;
  staleCount: number;
  capability: StrictVideoProbeCapability;
}>;

export type FrameLockSpikeSnapshot = Readonly<{
  surface: FrameLockSurface;
  sequenceMode: FrameLockSequence;
  assetSource: string;
  status: FrameLockSpikeStatus;
  errorCode: string | null;
  capability: StrictVideoProbeCapability;
  rows: readonly FrameLockSpikeReceiptRow[];
  presentedFrameIndex: number;
  presentedProgress: number;
  visualProgress: number;
  phBoundary: 'locked' | 'ready';
  staleCount: number;
  craneChildFrameLags: readonly number[];
  webglContextsReleased: boolean;
}>;

export type FrameLockSpikeApi = Readonly<{
  runSequence(mode?: FrameLockSequence): Promise<readonly FrameLockSpikeReceiptRow[]>;
  runLatestWins(oldFrameIndex?: number, latestFrameIndex?: number): Promise<readonly FrameLockSpikeReceiptRow[]>;
  requestFrame(frameIndex: number): Promise<FrameLockSpikeReceiptRow>;
  retire(): void;
  snapshot(): FrameLockSpikeSnapshot;
}>;

type FrameLockSpikeProps = Readonly<{
  autoRun?: boolean;
  video?: HTMLVideoElement;
  onProbeRequest?: ((frameIndex: number) => void) | undefined;
}>;

type AssetDescriptor = Readonly<{
  source: string;
  url: string;
  frameMap: SpikeVideoFrameMap;
}>;

type FrameMetadata = Readonly<{
  fpsNumerator: number;
  fpsDenominator: number;
  frameCount: number;
  firstPtsSeconds: number;
}>;

const FRAME_METADATA: Readonly<Record<string, FrameMetadata>> = Object.freeze({
  figure1: { fpsNumerator: 24, fpsDenominator: 1, frameCount: 49, firstPtsSeconds: 0 },
  'figure2-pair-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 156, firstPtsSeconds: 0 },
  'ph-figure-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 46, firstPtsSeconds: 0 },
  'ttg-figure-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 75, firstPtsSeconds: 0 },
  'crane-figure-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 75, firstPtsSeconds: 0 },
  'crane-flock-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 74, firstPtsSeconds: 0 },
  'aod-figure-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 78, firstPtsSeconds: 0 },
  'figure3-motion': { fpsNumerator: 30, fpsDenominator: 1, frameCount: 78, firstPtsSeconds: 0 }
});

const ASSET_URLS: Readonly<Record<string, string>> = Object.freeze({
  'assets/figure1.webm': new URL('../../../../assets/figure1.webm', import.meta.url).href,
  'assets/figure2-pair-motion.webm': new URL('../../../../assets/figure2-pair-motion.webm', import.meta.url).href,
  'assets/ph-figure-motion.webm': new URL('../../../../assets/ph-figure-motion.webm', import.meta.url).href,
  'assets/ttg-figure-motion.webm': new URL('../../../../assets/ttg-figure-motion.webm', import.meta.url).href,
  'assets/crane-figure-motion.webm': new URL('../../../../assets/crane-figure-motion.webm', import.meta.url).href,
  'assets/crane-flock-motion.webm': new URL('../../../../assets/crane-flock-motion.webm', import.meta.url).href,
  'assets/aod-figure-motion.webm': new URL('../../../../assets/aod-figure-motion.webm', import.meta.url).href,
  'assets/figure3-motion.webm': new URL('../../../../assets/figure3-motion.webm', import.meta.url).href,
  'assets/figure1-hevc-alpha.mp4': new URL('../../../../assets/figure1-hevc-alpha.mp4', import.meta.url).href,
  'assets/figure2-pair-motion-hevc-alpha.mp4': new URL('../../../../assets/figure2-pair-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/ph-figure-motion-hevc-alpha.mp4': new URL('../../../../assets/ph-figure-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/ttg-figure-motion-hevc-alpha.mp4': new URL('../../../../assets/ttg-figure-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/crane-figure-motion-hevc-alpha.mp4': new URL('../../../../assets/crane-figure-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/crane-flock-motion-hevc-alpha.mp4': new URL('../../../../assets/crane-flock-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/aod-figure-motion-hevc-alpha.mp4': new URL('../../../../assets/aod-figure-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/figure3-motion-hevc-alpha.mp4': new URL('../../../../assets/figure3-motion-hevc-alpha.mp4', import.meta.url).href,
  'assets/figure1-rgb-alpha.mp4': new URL('../../../../assets/figure1-rgb-alpha.mp4', import.meta.url).href,
  'assets/figure2-pair-motion-rgb-alpha.mp4': new URL('../../../../assets/figure2-pair-motion-rgb-alpha.mp4', import.meta.url).href,
  'assets/aod-figure-motion-rgb-alpha.mp4': new URL('../../../../assets/aod-figure-motion-rgb-alpha.mp4', import.meta.url).href,
  'assets/ph-figure-motion-rgb-alpha.mp4': new URL('../../../../assets/ph-figure-motion-rgb-alpha.mp4', import.meta.url).href,
  'assets/crane-figure-motion-rgb-alpha.mp4': new URL('../../../../assets/crane-figure-motion-rgb-alpha.mp4', import.meta.url).href,
  'assets/crane-flock-motion-rgb-alpha.mp4': new URL('../../../../assets/crane-flock-motion-rgb-alpha.mp4', import.meta.url).href
});

const DEFAULT_SEQUENCE: FrameLockSequence = 'forward';
const DEFAULT_RUN_ID = 'frame-lock-spike';
const FRAME_RECEIPT_TIMEOUT_MS = 1_500;

type SpikeProbe = StrictVideoProbe | StrictPackedProbe;

type SpikeReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  evidence: 'video-frame-callback' | 'packed-canvas-draw' | 'packed-frame-barrier' | 'none';
  capability: StrictVideoProbeCapability;
  children?: readonly Readonly<{
    desiredFrameIndex: number;
    presentedFrameIndex: number;
  }>[];
}>;

function sourceBase(source: string): string {
  return source
    .replace(/^assets\//, '')
    .replace(/\.(?:webm|mp4)$/, '')
    .replace(/-hevc-alpha$/, '')
    .replace(/-rgb-alpha$/, '');
}

function frameMapForSource(source: string): SpikeVideoFrameMap {
  const base = sourceBase(source);
  const metadata = FRAME_METADATA[base];
  const contract = mediaContract.canonicalVideoContracts.find((item) => sourceBase(item.source) === base);
  if (!metadata && !contract) {
    throw new Error(`No frame metadata is available for allowlisted asset ${source}`);
  }
  const fallbackFpsNumerator = metadata?.fpsNumerator ?? 30;
  const fallbackFpsDenominator = metadata?.fpsDenominator ?? 1;
  const [fpsNumeratorText, fpsDenominatorText] = (contract?.fps ?? `${fallbackFpsNumerator}/${fallbackFpsDenominator}`).split('/');
  const fpsNumerator = Number(fpsNumeratorText);
  const fpsDenominator = Number(fpsDenominatorText);
  const frameCount = contract?.frames ?? metadata?.frameCount;
  const firstPtsSeconds = contract?.firstPts ?? metadata?.firstPtsSeconds;
  if (!Number.isInteger(fpsNumerator) || !Number.isInteger(fpsDenominator)
    || !Number.isInteger(frameCount) || frameCount === undefined
    || !Number.isFinite(firstPtsSeconds) || firstPtsSeconds === undefined) {
    throw new Error(`No frame metadata is available for allowlisted asset ${source}`);
  }
  return {
    fpsNumerator,
    fpsDenominator,
    firstPtsSeconds,
    frameCount,
    startFrame: 0,
    endFrame: frameCount - 1
  };
}

function allowlistedVideoSources(): readonly string[] {
  return [...new Set([
    ...mediaContract.animationWebmSources,
    ...mediaContract.animationHevcAlphaSources,
    ...mediaContract.packedAlphaVideoSources
  ])];
}

function assetDescriptor(source: string): AssetDescriptor {
  if (!allowlistedVideoSources().includes(source)) {
    throw new Error(`Asset is not allowlisted by homepage-media-contract.mjs: ${source}`);
  }
  const url = ASSET_URLS[source];
  if (!url) throw new Error(`No bundled URL exists for allowlisted asset ${source}`);
  return { source, url, frameMap: frameMapForSource(source) };
}

function assetByAlias(alias: string | null | undefined): AssetDescriptor {
  const candidates = allowlistedVideoSources();
  const normalized = (alias ?? '').replace(/^\/+/, '');
  const match = candidates.find((source) => (
    source === normalized
      || source.replace(/^assets\//, '') === normalized
      || sourceBase(source) === normalized
  ));
  if (!match) {
    throw new Error(`Asset alias is not allowlisted by homepage-media-contract.mjs: ${alias ?? '(missing)'}`);
  }
  return assetDescriptor(match);
}

function queryConfig(): Readonly<{
  surface: FrameLockSurface;
  sequence: FrameLockSequence;
  asset: AssetDescriptor;
  forceNoRvfc: boolean;
}> {
  if (typeof window === 'undefined') {
    return {
      surface: 'desktop-ph',
      sequence: DEFAULT_SEQUENCE,
      asset: assetDescriptor('assets/ph-figure-motion.webm'),
      forceNoRvfc: false
    };
  }
  const query = new URLSearchParams(window.location.search);
  const shortcutSurface = window.location.pathname === '/harness/ph'
    ? 'phone-ph'
    : window.location.pathname === '/harness/crane'
      ? 'phone-crane'
      : null;
  const surfaceValue = query.get('surface') ?? shortcutSurface;
  const surface: FrameLockSurface = surfaceValue === 'phone-ph'
    || surfaceValue === 'phone-crane'
    || surfaceValue === 'asset'
    ? surfaceValue
    : 'desktop-ph';
  const sequenceValue = query.get('sequence');
  const sequence: FrameLockSequence = sequenceValue === 'reverse'
    || sequenceValue === 'endpoints'
    || sequenceValue === 'random'
    || sequenceValue === 'pressure'
    ? sequenceValue
    : DEFAULT_SEQUENCE;
  const source = surface === 'phone-ph'
    ? 'assets/ph-figure-motion-rgb-alpha.mp4'
    : surface === 'phone-crane'
      ? 'assets/crane-figure-motion-rgb-alpha.mp4'
      : surface === 'asset'
      ? query.get('asset')
        : 'assets/ph-figure-motion.webm';
  return {
    surface,
    sequence,
    asset: surface === 'asset'
      ? assetByAlias(source)
      : assetDescriptor(source as string),
    forceNoRvfc: query.get('rvfc') === 'unavailable'
  };
}

function browserCapability(rvfcAvailable: boolean): StrictVideoProbeCapability {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browserMatch = userAgent.match(/(?:Chrome|CriOS|Firefox|FxiOS|Version|EdgiOS|Edg|Safari)\/([\d.]+)/i);
  const browserEngine = /Firefox/i.test(userAgent)
      ? 'Gecko'
      : /Chrome|CriOS|Chromium|Edg/i.test(userAgent)
        ? 'Blink'
        : /AppleWebKit/i.test(userAgent)
          ? 'WebKit'
          : 'unknown';
  const osMatch = userAgent.match(/(?:iPhone OS|CPU OS|Android)[ _/]([\d_.]+)/i);
  return {
    rvfcAvailable,
    callbackFailure: false,
    evidenceType: rvfcAvailable ? 'video-frame-callback' : 'none',
    browserEngine,
    browserVersion: browserMatch?.[1] ?? 'unknown',
    osVersion: osMatch?.[1]?.replaceAll('_', '.') ?? 'unknown',
    deviceModel: /iPhone/i.test(userAgent)
      ? 'iPhone'
      : /iPad/i.test(userAgent)
        ? 'iPad'
        : 'browser'
  };
}

function sequenceFrames(mode: FrameLockSequence, frameMap: SpikeVideoFrameMap): readonly number[] {
  const start = frameMap.startFrame;
  const end = frameMap.endFrame;
  const middle = Math.round(start + (end - start) * 0.5);
  const nearStart = Math.min(end, start + 1);
  const nearEnd = Math.max(start, end - 1);
  switch (mode) {
    case 'reverse':
      return [end, nearEnd, middle, nearStart, start];
    case 'endpoints':
      return [start, end, start];
    case 'random':
      return [
        start,
        Math.round(start + (end - start) * 0.73),
        Math.round(start + (end - start) * 0.11),
        Math.round(start + (end - start) * 0.58),
        middle,
        end,
        start
      ];
    case 'pressure':
      return [start, end, nearStart, nearEnd, middle, start, end, start];
    case 'forward':
      return [start, nearStart, middle, end, Math.max(start, middle - 11), nearEnd, start];
  }
}

function isPackedAsset(asset: AssetDescriptor): boolean {
  return asset.source.endsWith('-rgb-alpha.mp4');
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutHandle = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('frame-lock spike media metadata timed out'));
    }, FRAME_RECEIPT_TIMEOUT_MS);
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('frame-lock spike media metadata failed'));
    };
    const cleanup = () => {
      globalThis.clearTimeout(timeoutHandle);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export function FrameLockSpikeHarness({
  autoRun = true,
  video: suppliedVideo,
  onProbeRequest
}: FrameLockSpikeProps) {
  const config = useMemo(queryConfig, []);
  const flockAsset = useMemo(
    () => config.surface === 'phone-crane'
      ? assetDescriptor('assets/crane-flock-motion-rgb-alpha.mp4')
      : undefined,
    [config.surface]
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const flockVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const packedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flockCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeRef = useRef<SpikeProbe | null>(null);
  const packedProbeRef = useRef<StrictPackedProbe | null>(null);
  const flockPackedProbeRef = useRef<StrictPackedProbe | null>(null);
  const barrierRef = useRef<SpikeFrameBarrier | null>(null);
  const packedSurfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const flockSurfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const packedGenerationRef = useRef(0);
  const flockGenerationRef = useRef(0);
  const capabilityRef = useRef<StrictVideoProbeCapability>(browserCapability(false));
  const rowsRef = useRef<FrameLockSpikeReceiptRow[]>([]);
  const nextSequenceRef = useRef(0);
  const requestedFrameRef = useRef(config.asset.frameMap.startFrame);
  const presentedFrameRef = useRef(config.asset.frameMap.startFrame);
  const presentedProgressRef = useRef(0);
  const visualProgressRef = useRef(0);
  const staleCountRef = useRef(0);
  const boundaryRef = useRef<'locked' | 'ready'>('locked');
  const boundarySequenceRef = useRef<number | null>(null);
  const statusRef = useRef<FrameLockSpikeStatus>('booting');
  const errorCodeRef = useRef<string | null>(null);
  const craneChildFrameLagsRef = useRef<number[]>([]);
  const webglContextsReleasedRef = useRef(false);
  const probeGenerationRef = useRef(0);
  const onProbeRequestRef = useRef(onProbeRequest);
  const [rows, setRows] = useState<readonly FrameLockSpikeReceiptRow[]>([]);
  const [status, setStatus] = useState<FrameLockSpikeStatus>('booting');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [presentedFrameIndex, setPresentedFrameIndex] = useState(config.asset.frameMap.startFrame);
  const [visualProgress, setVisualProgress] = useState(0);
  const [phBoundary, setPhBoundary] = useState<'locked' | 'ready'>('locked');

  onProbeRequestRef.current = onProbeRequest;

  const updateStatus = (next: FrameLockSpikeStatus, nextErrorCode: string | null = null) => {
    statusRef.current = next;
    errorCodeRef.current = nextErrorCode;
    setStatus(next);
    setErrorCode(nextErrorCode);
  };

  const appendReceipt = (receipt: SpikeReceipt, startedAt: number): FrameLockSpikeReceiptRow => {
    if (receipt.status === 'stale') staleCountRef.current += 1;
    const frameLag = Math.abs(receipt.desiredFrameIndex - receipt.presentedFrameIndex);
    const committed = receipt.status === 'presented'
      && receipt.desiredFrameIndex === receipt.presentedFrameIndex;
    const row: FrameLockSpikeReceiptRow = {
      status: receipt.status,
      runId: receipt.runId,
      direction: receipt.direction,
      sequence: receipt.sequence,
      desiredFrameIndex: receipt.desiredFrameIndex,
      presentedFrameIndex: receipt.presentedFrameIndex,
      frameLag,
      evidence: receipt.evidence,
      seekToPresentMs: Math.max(0, performance.now() - startedAt),
      committed,
      staleCount: staleCountRef.current,
      capability: receipt.capability
    };
    if (committed) {
      presentedFrameRef.current = receipt.presentedFrameIndex;
      presentedProgressRef.current = progressForFrameIndex(config.asset.frameMap, receipt.presentedFrameIndex);
      visualProgressRef.current = presentedProgressRef.current;
      setPresentedFrameIndex(presentedFrameRef.current);
      setVisualProgress(visualProgressRef.current);
      if (receipt.sequence === boundarySequenceRef.current
        && receipt.presentedFrameIndex === config.asset.frameMap.endFrame) {
        boundaryRef.current = 'ready';
        setPhBoundary('ready');
      }
    }
    if (config.surface === 'phone-crane' && receipt.children) {
      craneChildFrameLagsRef.current = receipt.children.map((child) => (
        Math.abs(child.desiredFrameIndex - child.presentedFrameIndex)
      ));
    }
    rowsRef.current = [...rowsRef.current, row];
    setRows(rowsRef.current);
    return row;
  };

  const playbackVideos = (): HTMLVideoElement[] => {
    const videos = [suppliedVideo ?? videoRef.current];
    if (config.surface === 'phone-crane') videos.push(flockVideoRef.current);
    return videos.filter((video): video is HTMLVideoElement => video !== null);
  };

  const nudgePlayback = (): (() => void) => {
    const restorers = playbackVideos().map((video) => {
      const previousPlaybackRate = video.playbackRate;
      try {
        video.playbackRate = 0.25;
        const playback = video.play();
        if (playback) void playback.catch(() => undefined);
      } catch {
        // Autoplay policy and detached test media are both expected here.
      }
      return () => {
        video.pause();
        video.playbackRate = previousPlaybackRate;
      };
    });
    return () => restorers.forEach((restore) => restore());
  };

  const staleReceipt = (
    direction: 1 | -1,
    sequence: number,
    targetFrameIndex: number
  ): SpikeReceipt => ({
    status: 'stale',
    runId: DEFAULT_RUN_ID,
    direction,
    sequence,
    desiredFrameIndex: targetFrameIndex,
    presentedFrameIndex: targetFrameIndex,
    mediaTimeSeconds: mediaTimeForFrame(config.asset.frameMap, targetFrameIndex),
    evidence: 'none',
    capability: capabilityRef.current
  });

  const requestFrame = (
    frameIndex: number,
    expectedGeneration = probeGenerationRef.current
  ): Promise<FrameLockSpikeReceiptRow> => {
    if (expectedGeneration !== probeGenerationRef.current) {
      return Promise.reject(new Error('frame-lock spike request belongs to a retired generation'));
    }
    const map = config.asset.frameMap;
    const targetFrameIndex = Math.min(map.endFrame, Math.max(map.startFrame, Math.round(frameIndex)));
    const sequence = ++nextSequenceRef.current;
    const direction: 1 | -1 = targetFrameIndex >= requestedFrameRef.current ? 1 : -1;
    requestedFrameRef.current = targetFrameIndex;
    const startedAt = performance.now();
    if (targetFrameIndex === map.endFrame && config.surface !== 'asset') {
      boundarySequenceRef.current = sequence;
      boundaryRef.current = 'locked';
      setPhBoundary('locked');
    }
    const barrier = barrierRef.current;
    const probe = probeRef.current;
    if (!barrier && !probe) {
      return Promise.resolve(appendReceipt(
        staleReceipt(direction, sequence, targetFrameIndex),
        startedAt
      ));
    }
    if (barrier) {
      const promise = barrier.request({
        runId: DEFAULT_RUN_ID,
        direction,
        sequence,
        desiredProgress: progressForFrameIndex(map, targetFrameIndex)
      });
      const restorePlayback = nudgePlayback();
      onProbeRequestRef.current?.(targetFrameIndex);
      return promise.then((receipt: SpikeFrameBarrierReceipt) => {
        restorePlayback();
        return appendReceipt({
          ...receipt,
          capability: capabilityRef.current
        }, startedAt);
      }).catch(() => {
        restorePlayback();
        updateStatus('error', 'MEDIA_SEEK_FAILED');
        return appendReceipt(staleReceipt(direction, sequence, targetFrameIndex), startedAt);
      });
    }
    const promise = probe!.request({
      runId: DEFAULT_RUN_ID,
      direction,
      sequence,
      desiredProgress: progressForFrameIndex(map, targetFrameIndex),
      frameMap: map
    });
    const restorePlayback = nudgePlayback();
    onProbeRequestRef.current?.(targetFrameIndex);
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutReceipt = new Promise<SpikeReceipt>((resolve) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        probe!.dispose();
        if (probeRef.current === probe) probeRef.current = null;
        updateStatus('error', 'MEDIA_SEEK_FAILED');
        resolve({
          ...staleReceipt(direction, sequence, targetFrameIndex),
          capability: {
            ...capabilityRef.current,
            callbackFailure: true,
            evidenceType: 'none'
          }
        });
      }, FRAME_RECEIPT_TIMEOUT_MS);
    });
    return Promise.race([promise, timeoutReceipt]).then((receipt) => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      restorePlayback();
      if (timedOut && receipt.status !== 'stale') {
        return appendReceipt({ ...receipt, status: 'stale', evidence: 'none' }, startedAt);
      }
      return appendReceipt(receipt, startedAt);
    }).catch(() => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      restorePlayback();
      updateStatus('error', 'MEDIA_SEEK_FAILED');
      return appendReceipt(staleReceipt(direction, sequence, targetFrameIndex), startedAt);
    });
  };

  const runSequence = async (
    mode: FrameLockSequence = config.sequence,
    expectedGeneration = probeGenerationRef.current
  ): Promise<readonly FrameLockSpikeReceiptRow[]> => {
    if (expectedGeneration !== probeGenerationRef.current) return [];
    const videos = playbackVideos();
    if ((!probeRef.current && !barrierRef.current) || statusRef.current === 'static-fallback') {
      const before = rowsRef.current.length;
      for (const frameIndex of sequenceFrames(mode, config.asset.frameMap)) {
        await requestFrame(frameIndex, expectedGeneration);
      }
      return rowsRef.current.slice(before);
    }
    if (videos.length > 0) {
      try {
        await Promise.all(videos.map((video) => waitForVideoMetadata(video)));
      } catch {
        updateStatus('error', 'MEDIA_ELEMENT_ERROR');
        return [];
      }
    }
    const before = rowsRef.current.length;
    const frames = sequenceFrames(mode, config.asset.frameMap);
    if (mode === 'pressure') {
      await Promise.all(frames.map((frameIndex) => requestFrame(frameIndex, expectedGeneration)));
    } else {
      for (const frameIndex of frames) {
        if (expectedGeneration !== probeGenerationRef.current) return [];
        await requestFrame(frameIndex, expectedGeneration);
      }
    }
    const captured = rowsRef.current.slice(before);
    if (captured.length > 0 && captured.every((row) => row.status === 'stale')) {
      updateStatus('error', 'MEDIA_SEEK_FAILED');
    }
    return captured;
  };

  const runLatestWins = async (
    oldFrameIndex = config.asset.frameMap.startFrame,
    latestFrameIndex = config.asset.frameMap.endFrame
  ): Promise<readonly FrameLockSpikeReceiptRow[]> => {
    const before = rowsRef.current.length;
    const old = requestFrame(oldFrameIndex);
    const latest = requestFrame(latestFrameIndex);
    await Promise.all([old, latest]);
    return rowsRef.current.slice(before);
  };

  const retire = () => {
    barrierRef.current?.dispose();
    barrierRef.current = null;
    probeRef.current?.dispose();
    probeRef.current = null;
    packedProbeRef.current?.dispose();
    packedProbeRef.current = null;
    flockPackedProbeRef.current?.dispose();
    flockPackedProbeRef.current = null;
    packedSurfaceRef.current?.dispose('terminal');
    packedSurfaceRef.current = null;
    flockSurfaceRef.current?.dispose('terminal');
    flockSurfaceRef.current = null;
    packedGenerationRef.current = 0;
    flockGenerationRef.current = 0;
    if (config.surface === 'phone-crane') webglContextsReleasedRef.current = true;
  };

  useEffect(() => {
    const generation = probeGenerationRef.current + 1;
    probeGenerationRef.current = generation;
    webglContextsReleasedRef.current = false;
    const videos = [
      suppliedVideo ?? videoRef.current,
      ...(config.surface === 'phone-crane' ? [flockVideoRef.current] : [])
    ].filter((candidate): candidate is HTMLVideoElement => candidate !== null);
    const expectedVideoCount = config.surface === 'phone-crane' ? 2 : 1;
    if (videos.length !== expectedVideoCount) {
      updateStatus('error', 'MEDIA_ELEMENT_MISSING');
      return undefined;
    }
    const rvfcAvailable = !config.forceNoRvfc
      && videos.every((video) => typeof video.requestVideoFrameCallback === 'function');
    capabilityRef.current = browserCapability(rvfcAvailable);
    if (!rvfcAvailable) {
      updateStatus('static-fallback', 'MEDIA_FRAME_CALLBACK_UNAVAILABLE');
      if (autoRun) {
        queueMicrotask(() => {
          if (probeGenerationRef.current === generation) {
            void runSequence(config.sequence, generation);
          }
        });
      }
      return () => {
        if (probeGenerationRef.current === generation) probeGenerationRef.current += 1;
      };
    }

    const packed = config.surface === 'phone-crane' || isPackedAsset(config.asset);
    const packedProbeBoxes: Array<{ current: StrictPackedProbe | null }> = [];
    const packedSurfaces: Array<{
      surface: PhonePackedAlphaSurface;
      probeBox: { current: StrictPackedProbe | null };
      generationRef: { current: number };
    }> = [];
    if (packed) {
      const packedEntries = config.surface === 'phone-crane'
        ? [
          {
            video: videos[0]!,
            canvas: packedCanvasRef.current,
            source: config.asset,
            statusDataset: 'frameLockCraneFigure',
            layerName: 'crane-figure',
            generationRef: { current: 0 }
          },
          {
            video: videos[1]!,
            canvas: flockCanvasRef.current,
            source: flockAsset!,
            statusDataset: 'frameLockCraneFlock',
            layerName: 'crane-flock',
            generationRef: { current: 0 }
          }
        ]
        : [{
          video: videos[0]!,
          canvas: packedCanvasRef.current,
          source: config.asset,
          statusDataset: 'frameLockPacked',
          layerName: 'packed',
          generationRef: { current: 0 }
        }];
      for (const entry of packedEntries) {
        if (!entry.canvas) {
          updateStatus('error', 'MEDIA_CANVAS_MISSING');
          return undefined;
        }
        const probeBox = { current: null as StrictPackedProbe | null };
        const surface = createPhonePackedAlphaSurface({
          root: entry.canvas.parentElement ?? entry.video.parentElement ?? document.body,
          container: entry.canvas.parentElement ?? entry.video.parentElement ?? document.body,
          canvas: entry.canvas,
          video: entry.video,
          packedSourceUrl: entry.source.url,
          endpointSeconds: mediaTimeForFrame(entry.source.frameMap, entry.source.frameMap.endFrame),
          statusDataset: entry.statusDataset,
          layerName: entry.layerName,
          canvasClassName: 'frame-lock-spike__packed-canvas',
          frameTimeoutMs: FRAME_RECEIPT_TIMEOUT_MS,
          onFrame: (frame) => probeBox.current?.notifyFrame(frame),
          onFailure: (failure) => {
            updateStatus('error', 'MEDIA_SEEK_FAILED');
            probeBox.current?.fail(new Error(failure.message));
          }
        });
        const activeGeneration = surface.activate('forward');
        entry.generationRef.current = activeGeneration;
        const packedProbe = createStrictPackedProbe({
          video: entry.video,
          render: () => surface.render(),
          getActiveGeneration: () => entry.generationRef.current,
          capability: capabilityRef.current,
          timeoutMs: FRAME_RECEIPT_TIMEOUT_MS
        });
        probeBox.current = packedProbe;
        packedProbeBoxes.push(probeBox);
        packedSurfaces.push({ surface, probeBox, generationRef: entry.generationRef });
      }
      if (config.surface === 'phone-crane') {
        packedProbeRef.current = packedProbeBoxes[0]?.current ?? null;
        flockPackedProbeRef.current = packedProbeBoxes[1]?.current ?? null;
        packedGenerationRef.current = packedSurfaces[0]?.generationRef.current ?? 0;
        flockGenerationRef.current = packedSurfaces[1]?.generationRef.current ?? 0;
        if (packedProbeRef.current && flockPackedProbeRef.current && flockAsset) {
          barrierRef.current = createSpikeFrameBarrier({
            masterFrameMap: config.asset.frameMap,
            childFrameMaps: [config.asset.frameMap, flockAsset.frameMap],
            clocks: [packedProbeRef.current, flockPackedProbeRef.current]
          });
        }
        packedSurfaceRef.current = packedSurfaces[0]?.surface ?? null;
        flockSurfaceRef.current = packedSurfaces[1]?.surface ?? null;
      } else {
        packedProbeRef.current = packedProbeBoxes[0]?.current ?? null;
        packedSurfaceRef.current = packedSurfaces[0]?.surface ?? null;
        packedGenerationRef.current = packedSurfaces[0]?.generationRef.current ?? 0;
        probeRef.current = packedProbeRef.current;
      }
    } else {
      probeRef.current = createStrictVideoProbe(videos[0]!, capabilityRef.current);
    }
    if (statusRef.current !== 'error') updateStatus('ready');
    const onError = () => updateStatus('error', 'MEDIA_ELEMENT_ERROR');
    videos.forEach((currentVideo) => currentVideo.addEventListener('error', onError));
    if (autoRun) {
      queueMicrotask(() => {
        if (probeGenerationRef.current === generation) {
          void runSequence(config.sequence, generation);
        }
      });
    }
    return () => {
      videos.forEach((currentVideo) => currentVideo.removeEventListener('error', onError));
      if (probeGenerationRef.current === generation) {
        retire();
        probeGenerationRef.current += 1;
      }
    };
  }, [autoRun, config.forceNoRvfc, config.sequence, suppliedVideo]);

  useEffect(() => {
    const api: FrameLockSpikeApi = {
      runSequence,
      runLatestWins,
      requestFrame,
      retire,
      snapshot: () => ({
        surface: config.surface,
        sequenceMode: config.sequence,
        assetSource: config.asset.source,
        status: statusRef.current,
        errorCode: errorCodeRef.current,
        capability: capabilityRef.current,
        rows: rowsRef.current,
        presentedFrameIndex: presentedFrameRef.current,
        presentedProgress: presentedProgressRef.current,
        visualProgress: visualProgressRef.current,
        phBoundary: boundaryRef.current,
        staleCount: staleCountRef.current,
        craneChildFrameLags: craneChildFrameLagsRef.current,
        webglContextsReleased: webglContextsReleasedRef.current
      })
    };
    window.__frameLockSpike = api;
    return () => {
      if (window.__frameLockSpike === api) delete window.__frameLockSpike;
    };
  });

  const frameMap = config.asset.frameMap;
  const packedDecoderSurface = config.surface === 'phone-ph'
    || config.surface === 'phone-crane'
    || (config.surface === 'asset' && isPackedAsset(config.asset));
  return (
    <main
      className="frame-lock-spike"
      data-frame-lock-status={status}
      data-frame-lock-error={errorCode ?? undefined}
      data-frame-lock-surface={config.surface}
      data-frame-lock-asset={config.asset.source}
      data-frame-lock-crane-contexts-released={webglContextsReleasedRef.current ? 'true' : 'false'}
    >
      <header className="frame-lock-spike__header">
        <div>
          <p className="frame-lock-spike__kicker">DISPOSABLE TECHNICAL SPIKE</p>
          <h1>Exact presented-frame probe</h1>
          <p className="frame-lock-spike__lede">PH · {config.surface} · {config.sequence} · {config.asset.source}</p>
        </div>
        <dl className="frame-lock-spike__summary" aria-label="frame clock summary">
          <div><dt>status</dt><dd>{status}</dd></div>
          <div><dt>presented</dt><dd data-frame-clock-presented-frame>{presentedFrameIndex}</dd></div>
          <div><dt>visual progress</dt><dd data-frame-clock-visual-progress>{visualProgress.toFixed(4)}</dd></div>
          <div><dt>stale</dt><dd data-frame-clock-stale-count>{staleCountRef.current}</dd></div>
        </dl>
      </header>

      <section ref={stageRef} className="frame-lock-spike__stage" aria-label="PH media boundary">
        <video
          ref={videoRef}
          className="frame-lock-spike__video"
          data-frame-lock-decoder={packedDecoderSurface ? 'true' : undefined}
          src={suppliedVideo ? undefined : config.asset.url}
          muted
          playsInline
          preload="auto"
          aria-label="PH frame-lock probe video"
        />
        {(config.surface === 'phone-ph' || config.surface === 'phone-crane'
          || (config.surface === 'asset' && isPackedAsset(config.asset))) && (
          <canvas
            ref={packedCanvasRef}
            className="frame-lock-spike__packed-canvas"
            data-frame-lock-packed-canvas="primary"
            aria-hidden="true"
          />
        )}
        {config.surface === 'phone-crane' && flockAsset && (
          <>
            <video
              ref={flockVideoRef}
              className="frame-lock-spike__video frame-lock-spike__video--flock"
              data-frame-lock-decoder="true"
              src={flockAsset.url}
              muted
              playsInline
              preload="auto"
              aria-label="Crane flock frame-lock probe video"
            />
            <canvas
              ref={flockCanvasRef}
              className="frame-lock-spike__packed-canvas frame-lock-spike__packed-canvas--flock"
              data-frame-lock-packed-canvas="flock"
              aria-hidden="true"
            />
          </>
        )}
        <div
          className="frame-lock-spike__visual-state"
          data-frame-lock-visual-progress={visualProgress.toFixed(4)}
          style={{ '--frame-lock-progress': visualProgress } as CSSProperties}
        />
        <div className="frame-lock-spike__readout">
          <span>frame map {frameMap.startFrame}–{frameMap.endFrame}</span>
          <span>{frameMap.fpsNumerator}/{frameMap.fpsDenominator} fps</span>
          <span>first PTS {frameMap.firstPtsSeconds.toFixed(4)}s</span>
        </div>
      </section>

      <section
        className="frame-lock-spike__boundary"
        data-ph-education-boundary
        data-state={phBoundary}
        aria-live="polite"
      >
        {phBoundary === 'ready'
          ? 'PH endpoint receipt accepted · copy/dissolve ready'
          : 'PH media receipt required · copy/dissolve locked'}
      </section>

      {config.surface === 'phone-crane' && (
        <p className="frame-lock-spike__crane-diagnostics" data-frame-lock-crane-diagnostics>
          Crane child frame lag: {craneChildFrameLagsRef.current.join(', ') || 'pending'} ·
          contexts released: {webglContextsReleasedRef.current ? 'yes' : 'no'}
        </p>
      )}

      {(status === 'static-fallback' || status === 'error') && (
        <p className="frame-lock-spike__fallback" data-frame-lock-fallback>
          Strict frame proof unavailable: static fail-closed ({errorCode}).
        </p>
      )}

      <section className="frame-lock-spike__table-wrap" aria-label="frame receipt diagnostics">
        <table data-frame-lock-table>
          <caption>Presented-frame receipts</caption>
          <thead>
            <tr>
              <th>seq</th>
              <th>desired frame</th>
              <th>presented frame</th>
              <th>lag</th>
              <th>evidence</th>
              <th>latency</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.sequence}-${index}`}
                data-frame-lock-row={String(index)}
                data-status={row.status}
                data-desired-frame={String(row.desiredFrameIndex)}
                data-presented-frame={String(row.presentedFrameIndex)}
                data-evidence={row.evidence}
              >
                <td data-frame-lock-field="sequence">{row.sequence}</td>
                <td data-frame-lock-field="desired">{row.desiredFrameIndex}</td>
                <td data-frame-lock-field="presented">{row.presentedFrameIndex}</td>
                <td data-frame-lock-field="lag">{row.frameLag}</td>
                <td data-frame-lock-field="evidence">{row.evidence}</td>
                <td data-frame-lock-field="latency">{row.seekToPresentMs.toFixed(1)} ms</td>
                <td data-frame-lock-field="status">{row.status}{row.committed ? ' · committed' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

declare global {
  interface Window {
    __frameLockSpike?: FrameLockSpikeApi;
  }
}
