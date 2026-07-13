import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoDriverSnapshot,
  type TimelineVideoFrameResult
} from './timeline-video-driver';

export type DirectionalMediaSurfaceStatus =
  | 'parked'
  | 'preparing'
  | 'ready'
  | 'active'
  | 'terminal';

export type DirectionalMediaInput = TimelineVideoDriveInput & Readonly<{
  surface: string;
}>;

export type DirectionalMediaSurfaceSnapshot = Readonly<{
  status: DirectionalMediaSurfaceStatus;
  generation: number;
  runId: string | undefined;
  direction: 1 | -1 | undefined;
  preparedProgress: number | undefined;
}>;

export type DirectionalMediaControllerSnapshot = Readonly<{
  activeSurface: string | undefined;
  surfaces: Readonly<Record<string, DirectionalMediaSurfaceSnapshot>>;
  disposed: boolean;
}>;

export type DirectionalMediaController = Readonly<{
  prepare(input: DirectionalMediaInput): Promise<TimelineVideoFrameResult>;
  activate(input: DirectionalMediaInput): TimelineVideoDriverSnapshot | undefined;
  prepareAndActivate(input: DirectionalMediaInput): Promise<TimelineVideoFrameResult>;
  drive(input: DirectionalMediaInput): TimelineVideoDriverSnapshot | undefined;
  markTerminal(surface: string): void;
  park(surface: string): void;
  snapshot(): DirectionalMediaControllerSnapshot;
  dispose(): void;
}>;

type SurfaceRecord = {
  video: HTMLVideoElement;
  status: DirectionalMediaSurfaceStatus;
  generation: number;
  runId?: string;
  direction?: 1 | -1;
  preparedProgress?: number;
  preparationKey?: string;
  pending?: Promise<TimelineVideoFrameResult>;
  preparedSignal?: AbortSignal;
  onPreparedAbort?: () => void;
};

export class DirectionalMediaStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectionalMediaStateError';
  }
}

function withoutSurface(input: DirectionalMediaInput): TimelineVideoDriveInput {
  const driveInput: TimelineVideoDriveInput & { surface?: string } = { ...input };
  delete driveInput.surface;
  return driveInput;
}

function preparationKey(input: DirectionalMediaInput): string {
  return [input.surface, input.runId, input.direction, input.progress.toFixed(6)].join(':');
}

function staleResult(input: DirectionalMediaInput, generation: number): TimelineVideoFrameResult {
  return {
    status: 'stale',
    runId: input.runId,
    direction: input.direction,
    generation,
    targetTime: Number.NaN
  };
}

export function createDirectionalMediaController(options: {
  surfaces: Readonly<Record<string, HTMLVideoElement>>;
  activeClassName?: string;
  parkedPreload?: 'none' | 'metadata';
}): DirectionalMediaController {
  const activeClassName = options.activeClassName ?? 'is-active';
  const parkedPreload = options.parkedPreload ?? 'metadata';
  const surfaces = new Map<string, SurfaceRecord>(
    Object.entries(options.surfaces).map(([key, video]) => [
      key,
      {
        video,
        status: video.classList.contains(activeClassName) ? 'active' : 'parked',
        generation: 0
      }
    ])
  );
  let activeSurface = [...surfaces.entries()].find(([, record]) => record.status === 'active')?.[0];
  let disposed = false;

  const recordFor = (surface: string): SurfaceRecord => {
    const record = surfaces.get(surface);
    if (!record) {
      throw new DirectionalMediaStateError(`Unknown directional media surface: ${surface}`);
    }
    return record;
  };

  const markStatus = (surface: string, record: SurfaceRecord, status: DirectionalMediaSurfaceStatus) => {
    record.status = status;
    record.video.dataset.directionalMediaSurface = surface;
    record.video.dataset.directionalMediaStatus = status;
    record.video.dataset.directionalMediaGeneration = String(record.generation);
  };

  const clearPreparedAbort = (record: SurfaceRecord) => {
    if (record.preparedSignal && record.onPreparedAbort) {
      record.preparedSignal.removeEventListener('abort', record.onPreparedAbort);
    }
    delete record.preparedSignal;
    delete record.onPreparedAbort;
  };

  const parkRecord = (surface: string, record: SurfaceRecord) => {
    if (
      record.status === 'parked'
      && record.video.preload === parkedPreload
      && !record.video.classList.contains(activeClassName)
    ) {
      return;
    }
    clearPreparedAbort(record);
    record.generation += 1;
    disposeTimelineVideoDriver(record.video);
    record.video.pause();
    record.video.classList.remove(activeClassName);
    if (record.video.preload !== parkedPreload) {
      record.video.preload = parkedPreload;
      record.video.load?.();
    }
    delete record.runId;
    delete record.direction;
    delete record.preparedProgress;
    delete record.preparationKey;
    delete record.pending;
    markStatus(surface, record, 'parked');
    if (activeSurface === surface) {
      activeSurface = undefined;
    }
  };

  const controller: DirectionalMediaController = {
    prepare(input) {
      if (disposed) {
        return Promise.resolve(staleResult(input, -1));
      }
      const record = recordFor(input.surface);
      const key = preparationKey(input);
      if (record.preparationKey === key && record.pending) {
        return record.pending;
      }
      if (record.preparationKey === key && (record.status === 'ready' || record.status === 'active')) {
        return prepareTimelineVideoFrame(record.video, withoutSurface(input))
          .then((result) => result ?? staleResult(input, record.generation));
      }

      record.generation += 1;
      clearPreparedAbort(record);
      const generation = record.generation;
      record.runId = input.runId;
      record.direction = input.direction;
      record.preparedProgress = input.progress;
      record.preparationKey = key;
      markStatus(input.surface, record, 'preparing');
      record.video.pause();
      if (record.video.preload !== 'auto') {
        record.video.preload = 'auto';
      }

      const pending = prepareTimelineVideoFrame(record.video, withoutSurface(input))
        .then((result) => {
          if (
            disposed
            || record.generation !== generation
            || record.preparationKey !== key
            || result?.status !== 'ready'
          ) {
            return result ?? staleResult(input, generation);
          }
          markStatus(input.surface, record, 'ready');
          const signal = input.signal;
          if (signal) {
            const onPreparedAbort = () => {
              if (
                !disposed
                && record.generation === generation
                && record.preparationKey === key
                && record.status === 'ready'
              ) {
                parkRecord(input.surface, record);
              }
            };
            record.preparedSignal = signal;
            record.onPreparedAbort = onPreparedAbort;
            if (signal.aborted) {
              onPreparedAbort();
            } else {
              signal.addEventListener('abort', onPreparedAbort, { once: true });
            }
          }
          return result;
        })
        .catch((error: unknown) => {
          if (
            !disposed
            && record.generation === generation
            && record.preparationKey === key
          ) {
            parkRecord(input.surface, record);
          }
          throw error;
        })
        .finally(() => {
          if (record.generation === generation && record.pending === pending) {
            delete record.pending;
          }
        });
      record.pending = pending;
      return pending;
    },
    activate(input) {
      if (disposed) {
        throw new DirectionalMediaStateError('Directional media controller is disposed');
      }
      const record = recordFor(input.surface);
      const key = preparationKey(input);
      if (
        record.preparationKey !== key
        || (record.status !== 'ready' && record.status !== 'active' && record.status !== 'terminal')
      ) {
        throw new DirectionalMediaStateError(
          `Directional media surface ${input.surface} is not ready for ${input.runId}`
        );
      }
      for (const [surface, candidate] of surfaces) {
        if (surface === input.surface) {
          continue;
        }
        const sameRunReadySibling = candidate.status === 'ready'
          && candidate.runId === input.runId
          && candidate.direction === input.direction;
        if (!sameRunReadySibling) {
          parkRecord(surface, candidate);
        }
      }
      clearPreparedAbort(record);
      record.video.classList.add(activeClassName);
      activeSurface = input.surface;
      markStatus(input.surface, record, 'active');
      return driveTimelineVideo(record.video, withoutSurface(input));
    },
    async prepareAndActivate(input) {
      const result = await controller.prepare(input);
      if (result.status === 'ready') {
        controller.activate(input);
      }
      return result;
    },
    drive(input) {
      if (disposed) {
        throw new DirectionalMediaStateError('Directional media controller is disposed');
      }
      const record = recordFor(input.surface);
      if (
        activeSurface !== input.surface
        || (record.status !== 'active' && record.status !== 'terminal')
      ) {
        throw new DirectionalMediaStateError(`Directional media surface ${input.surface} is not active`);
      }
      if (record.runId !== input.runId || record.direction !== input.direction) {
        throw new DirectionalMediaStateError(
          `Directional media surface ${input.surface} belongs to a different run`
        );
      }
      return driveTimelineVideo(record.video, withoutSurface(input));
    },
    markTerminal(surface) {
      const record = recordFor(surface);
      if (activeSurface !== surface || record.status !== 'active') {
        throw new DirectionalMediaStateError(`Directional media surface ${surface} is not active`);
      }
      record.video.pause();
      markStatus(surface, record, 'terminal');
    },
    park(surface) {
      if (disposed) {
        return;
      }
      parkRecord(surface, recordFor(surface));
    },
    snapshot() {
      return {
        activeSurface,
        surfaces: Object.fromEntries(
          [...surfaces.entries()].map(([surface, record]) => [
            surface,
            {
              status: record.status,
              generation: record.generation,
              runId: record.runId,
              direction: record.direction,
              preparedProgress: record.preparedProgress
            }
          ])
        ),
        disposed
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      for (const [surface, record] of surfaces) {
        parkRecord(surface, record);
        delete record.video.dataset.directionalMediaSurface;
        delete record.video.dataset.directionalMediaStatus;
        delete record.video.dataset.directionalMediaGeneration;
      }
      disposed = true;
      activeSurface = undefined;
    }
  };

  return controller;
}
