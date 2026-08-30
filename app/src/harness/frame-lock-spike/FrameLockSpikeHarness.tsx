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
  evidence: StrictVideoProbeReceipt['evidence'];
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
  rows: readonly FrameLockSpikeReceiptRow[];
  presentedFrameIndex: number;
  presentedProgress: number;
  visualProgress: number;
  phBoundary: 'locked' | 'ready';
  staleCount: number;
}>;

export type FrameLockSpikeApi = Readonly<{
  runSequence(mode?: FrameLockSequence): Promise<readonly FrameLockSpikeReceiptRow[]>;
  runLatestWins(oldFrameIndex?: number, latestFrameIndex?: number): Promise<readonly FrameLockSpikeReceiptRow[]>;
  requestFrame(frameIndex: number): Promise<FrameLockSpikeReceiptRow>;
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
  const surfaceValue = query.get('surface');
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

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('frame-lock spike media metadata failed'));
    };
    const cleanup = () => {
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const probeRef = useRef<StrictVideoProbe | null>(null);
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

  const appendReceipt = (receipt: StrictVideoProbeReceipt, startedAt: number): FrameLockSpikeReceiptRow => {
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
    rowsRef.current = [...rowsRef.current, row];
    setRows(rowsRef.current);
    return row;
  };

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
    const probe = probeRef.current;
    if (!probe) {
      const receipt: StrictVideoProbeReceipt = {
        status: 'stale',
        runId: DEFAULT_RUN_ID,
        direction,
        sequence,
        desiredFrameIndex: targetFrameIndex,
        presentedFrameIndex: targetFrameIndex,
        mediaTimeSeconds: mediaTimeForFrame(map, targetFrameIndex),
        evidence: 'none',
        capability: capabilityRef.current
      };
      return Promise.resolve(appendReceipt(receipt, startedAt));
    }
    const promise = probe.request({
      runId: DEFAULT_RUN_ID,
      direction,
      sequence,
      desiredProgress: progressForFrameIndex(map, targetFrameIndex),
      frameMap: map
    });
    onProbeRequestRef.current?.(targetFrameIndex);
    const playbackVideo = suppliedVideo ?? videoRef.current;
    const previousPlaybackRate = playbackVideo?.playbackRate;
    let playbackNudge: Promise<void> | undefined;
    try {
      if (playbackVideo && previousPlaybackRate !== undefined) {
        playbackVideo.playbackRate = 0.25;
      }
      playbackNudge = typeof playbackVideo?.play === 'function'
        ? playbackVideo.play()
        : undefined;
    } catch {
      playbackNudge = undefined;
    }
    if (playbackNudge) {
      void playbackNudge.catch(() => undefined);
    }
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutReceipt = new Promise<StrictVideoProbeReceipt>((resolve) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        probe.dispose();
        if (probeRef.current === probe) probeRef.current = null;
        updateStatus('error', 'MEDIA_SEEK_FAILED');
        resolve({
          status: 'stale',
          runId: DEFAULT_RUN_ID,
          direction,
          sequence,
          desiredFrameIndex: targetFrameIndex,
          presentedFrameIndex: targetFrameIndex,
          mediaTimeSeconds: mediaTimeForFrame(map, targetFrameIndex),
          evidence: 'none',
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
      playbackVideo?.pause();
      if (playbackVideo && previousPlaybackRate !== undefined) {
        playbackVideo.playbackRate = previousPlaybackRate;
      }
      if (timedOut && receipt.status !== 'stale') {
        return appendReceipt({ ...receipt, status: 'stale', evidence: 'none' }, startedAt);
      }
      return appendReceipt(receipt, startedAt);
    });
  };

  const runSequence = async (
    mode: FrameLockSequence = config.sequence,
    expectedGeneration = probeGenerationRef.current
  ): Promise<readonly FrameLockSpikeReceiptRow[]> => {
    if (expectedGeneration !== probeGenerationRef.current) return [];
    const video = suppliedVideo ?? videoRef.current;
    if (!probeRef.current || statusRef.current === 'static-fallback') {
      const before = rowsRef.current.length;
      for (const frameIndex of sequenceFrames(mode, config.asset.frameMap)) {
        await requestFrame(frameIndex, expectedGeneration);
      }
      return rowsRef.current.slice(before);
    }
    if (video) {
      try {
        await waitForVideoMetadata(video);
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

  useEffect(() => {
    const generation = probeGenerationRef.current + 1;
    probeGenerationRef.current = generation;
    const video = suppliedVideo ?? videoRef.current;
    if (!video) {
      updateStatus('error', 'MEDIA_ELEMENT_MISSING');
      return undefined;
    }
    const rvfcAvailable = !config.forceNoRvfc
      && typeof video.requestVideoFrameCallback === 'function';
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
    probeRef.current = createStrictVideoProbe(video, capabilityRef.current);
    updateStatus('ready');
    const onError = () => updateStatus('error', 'MEDIA_ELEMENT_ERROR');
    video.addEventListener('error', onError);
    if (autoRun) {
      queueMicrotask(() => {
        if (probeGenerationRef.current === generation) {
          void runSequence(config.sequence, generation);
        }
      });
    }
    return () => {
      video.removeEventListener('error', onError);
      if (probeGenerationRef.current === generation) {
        probeRef.current?.dispose();
        probeRef.current = null;
        probeGenerationRef.current += 1;
      }
    };
  }, [autoRun, config.forceNoRvfc, config.sequence, suppliedVideo]);

  useEffect(() => {
    const api: FrameLockSpikeApi = {
      runSequence,
      runLatestWins,
      requestFrame,
      snapshot: () => ({
        surface: config.surface,
        sequenceMode: config.sequence,
        assetSource: config.asset.source,
        status: statusRef.current,
        errorCode: errorCodeRef.current,
        rows: rowsRef.current,
        presentedFrameIndex: presentedFrameRef.current,
        presentedProgress: presentedProgressRef.current,
        visualProgress: visualProgressRef.current,
        phBoundary: boundaryRef.current,
        staleCount: staleCountRef.current
      })
    };
    window.__frameLockSpike = api;
    return () => {
      if (window.__frameLockSpike === api) delete window.__frameLockSpike;
    };
  });

  const frameMap = config.asset.frameMap;
  return (
    <main
      className="frame-lock-spike"
      data-frame-lock-status={status}
      data-frame-lock-error={errorCode ?? undefined}
      data-frame-lock-surface={config.surface}
      data-frame-lock-asset={config.asset.source}
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

      <section className="frame-lock-spike__stage" aria-label="PH media boundary">
        <video
          ref={videoRef}
          className="frame-lock-spike__video"
          src={suppliedVideo ? undefined : config.asset.url}
          muted
          playsInline
          preload="auto"
          aria-label="PH frame-lock probe video"
        />
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
