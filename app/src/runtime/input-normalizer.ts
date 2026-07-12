import type { DirectorInputSource } from '../story/types';

const DEFAULT_VIEWPORT_HEIGHT = 1000;
const LINE_HEIGHT_PX = 16;

export type NormalizedInputDelta = {
  source: DirectorInputSource;
  pixels: number;
  viewportFraction: number;
  delta: number;
  viewportHeight: number;
};

export type WheelLikeInput = {
  type: 'wheel';
  deltaY: number;
  deltaMode?: 0 | 1 | 2;
  viewportHeight?: number;
};

export type TouchLikeInput = {
  type: 'touch';
  currentY: number;
  previousY: number;
  viewportHeight?: number;
};

export type KeyLikeInput = {
  type: 'key';
  key: string;
  viewportHeight?: number;
};

export type RawInput = WheelLikeInput | TouchLikeInput | KeyLikeInput;

function viewportHeight(inputHeight: number | undefined): number {
  return inputHeight && inputHeight > 0 ? inputHeight : DEFAULT_VIEWPORT_HEIGHT;
}

export function wheelDeltaPixels(input: Pick<WheelLikeInput, 'deltaY' | 'deltaMode' | 'viewportHeight'>): number {
  const mode = input.deltaMode ?? 0;
  if (mode === 1) {
    return input.deltaY * LINE_HEIGHT_PX;
  }
  if (mode === 2) {
    return input.deltaY * viewportHeight(input.viewportHeight);
  }
  return input.deltaY;
}

export function pixelsToViewportFraction(pixels: number, inputViewportHeight?: number): number {
  return pixels / viewportHeight(inputViewportHeight);
}

export function normalizeInputDelta(input: RawInput): NormalizedInputDelta {
  const height = viewportHeight(input.viewportHeight);
  if (input.type === 'wheel') {
    const pixels = wheelDeltaPixels(input);
    const viewportFraction = pixels / height;
    return {
      source: 'wheel',
      pixels,
      viewportFraction,
      delta: viewportFraction,
      viewportHeight: height
    };
  }

  if (input.type === 'touch') {
    const pixels = input.previousY - input.currentY;
    const viewportFraction = pixels / height;
    return {
      source: 'touch',
      pixels,
      viewportFraction,
      delta: viewportFraction,
      viewportHeight: height
    };
  }

  const viewportFraction = keyToViewportFraction(input.key);
  return {
    source: 'key',
    pixels: viewportFraction * height,
    viewportFraction,
    delta: viewportFraction,
    viewportHeight: height
  };
}

export function keyToViewportFraction(key: string): number {
  switch (key) {
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Spacebar':
      return 0.1;
    case 'ArrowUp':
    case 'PageUp':
      return -0.1;
    default:
      return 0;
  }
}
