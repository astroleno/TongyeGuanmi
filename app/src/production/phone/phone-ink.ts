import {
  clearBoundaryGeometry
} from '../../transitions/shared/inkOwnership';
import {
  createPhoneInkRuntimeBridge,
  type PhoneInkRuntimeBridge
} from '../../transitions/shared/phone-ink-runtime';
import type { InkGradePreset } from '../../transitions/shared/sceneInk';
import {
  acquirePhoneBoundaryGeometryLease,
  type PhoneBoundaryGeometryLease
} from './phone-boundary-geometry';
import type { PhoneCinematicRequest } from './types';

/** Positional field description safe to carry between independently minified chunks. */
export type PhoneInkFieldRequest = readonly [
  kind: 'horizontal' | 'radial',
  seed: string,
  direction: 'top-to-bottom' | 'bottom-to-top' | null,
  originX: number | null,
  originY: number | null
];

/** Positional construction request for the shared Phone ink runtime. */
export type PhoneInkTransitionRequest = readonly [
  host: HTMLElement | null,
  canvas: HTMLCanvasElement | null,
  id: string,
  from: HTMLElement | null,
  additionalFrom: HTMLElement | null,
  to: HTMLElement | null,
  field: PhoneInkFieldRequest,
  grade: InkGradePreset | null
];

export type PhoneInkTransitionCommand =
  | readonly ['begin', request: PhoneCinematicRequest]
  | readonly ['render', progress: number, force?: boolean]
  | readonly ['commitEndpoint', endpoint: 0 | 1]
  | readonly ['releaseEndpoint']
  | readonly ['dispose'];

/** A callable bridge keeps the mutable ink handle inside its owner chunk. */
export type PhoneInkTransitionBridge = (
  command: PhoneInkTransitionCommand
) => boolean | void;

/** @deprecated v=16 characterization alias for the callable ink bridge. */
export type PhoneInkTransition = PhoneInkTransitionBridge;

/** Endpoint tolerance shared by ink visibility and browser-edge ownership. */
export const PHONE_INK_ENDPOINT_EPSILON = 0.001;

/** Clear transition-owned clip/mask state before the runtime changes owners. */
export function clearPhoneInkBoundary(element: HTMLElement): void {
  clearBoundaryGeometry(element);
}

/**
 * Route B has native document scroll rather than the production Director, but
 * it still uses the same shader-backed ink field that production transitions
 * own. The component maps each outgoing sticky section's local progress into
 * this small surface instead of substituting an opacity fade.
 */
export function createPhoneInkTransition(
  [
    requestHost,
    requestCanvas,
    requestId,
    requestFrom,
    requestAdditionalFrom,
    requestTo,
    fieldRequest,
    requestGrade
  ]: PhoneInkTransitionRequest
): PhoneInkTransitionBridge {
  const options = {
    host: requestHost,
    canvas: requestCanvas,
    id: requestId,
    from: requestFrom,
    additionalFrom: requestAdditionalFrom,
    to: requestTo,
    field: fieldRequest,
    grade: requestGrade
  };
  const runtime: PhoneInkRuntimeBridge = createPhoneInkRuntimeBridge([
    options.host,
    options.canvas,
    options.id,
    options.from,
    options.additionalFrom,
    options.to,
    options.field,
    options.grade
  ]);
  let geometryLease: PhoneBoundaryGeometryLease | undefined;
  const sourceEndpoints = [options.from, options.additionalFrom].filter(
    (element, index, elements): element is HTMLElement => (
      Boolean(element) && elements.indexOf(element) === index
    )
  );
  let direction: 1 | -1 = 1;
  // Geometry is structural, not directional. The same from/additionalFrom
  // conceal surfaces and to reveal surface are used while progress moves
  // either 0→1 or 1→0. Direction is passed to the runtime only so admission
  // proof can mark the physical receiver.
  const endpointElements = () => [
    ...sourceEndpoints,
    ...[options.to].filter((element): element is HTMLElement => Boolean(element))
  ];

  const begin = (request: PhoneCinematicRequest) => {
    direction = request[4];
    geometryLease?.releaseGeometry();
    geometryLease = acquirePhoneBoundaryGeometryLease(
      endpointElements(),
      [request[1], request[2]],
      clearBoundaryGeometry
    );
    runtime(['armEndpoint', direction]);
  };

  const render = (rawProgress: number, force = false): boolean => {
    if (!geometryLease) {
      begin([
        `phone-ink:${options.id}`,
        `phone-ink:${options.id}`,
        0,
        0,
        1
      ]);
    }
    return runtime(['render', rawProgress, force]) === true;
  };

  const releaseEndpoint = () => {
    geometryLease?.releaseGeometry();
    geometryLease = undefined;
    runtime(['releaseEndpoint']);
  };

  return (command) => {
    switch (command[0]) {
      case 'begin':
        begin(command[1]);
        return;
      case 'render':
        return render(command[1], command[2]);
      case 'commitEndpoint':
        render(command[1]);
        return;
      case 'releaseEndpoint':
        releaseEndpoint();
        return;
      case 'dispose':
        runtime(['dispose']);
        releaseEndpoint();
    }
  };
}
