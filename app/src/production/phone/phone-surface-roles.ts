import type { PhoneBoundaryGeometryOwner } from './phone-boundary-geometry';

export type PhoneSurfaceRole =
  | 'native-under-stage'
  | 'native-stable'
  | 'transition-endpoint';

export type PhoneSurfaceRoleElement = Readonly<{
  dataset: {
    phoneSurfaceRole?: string;
    phoneBoundarySession?: string;
    phoneBoundaryGeneration?: string;
    phoneBoundaryEndpoint?: string;
  };
}>;

export type PhoneSurfaceRoleTransaction = PhoneBoundaryGeometryOwner & Readonly<{
  commit(endpoint: 'source' | 'receiver'): void;
  rollback(): void;
  release(): void;
}>;

type SurfaceSnapshot = Readonly<{
  role: string | undefined;
  session: string | undefined;
  generation: string | undefined;
  endpoint: string | undefined;
}>;

const surfaceOwner = new WeakMap<object, object>();

function snapshot(element: PhoneSurfaceRoleElement): SurfaceSnapshot {
  const dataset = element.dataset;
  return {
    role: dataset.phoneSurfaceRole,
    session: dataset.phoneBoundarySession,
    generation: dataset.phoneBoundaryGeneration,
    endpoint: dataset.phoneBoundaryEndpoint
  };
}

function setDataset(
  dataset: PhoneSurfaceRoleElement['dataset'],
  key: keyof PhoneSurfaceRoleElement['dataset'],
  value: string | undefined
): void {
  if (value === undefined) delete dataset[key];
  else dataset[key] = value;
}

function restore(
  element: PhoneSurfaceRoleElement,
  previous: SurfaceSnapshot
): void {
  setDataset(element.dataset, 'phoneSurfaceRole', previous.role);
  setDataset(element.dataset, 'phoneBoundarySession', previous.session);
  setDataset(element.dataset, 'phoneBoundaryGeneration', previous.generation);
  setDataset(element.dataset, 'phoneBoundaryEndpoint', previous.endpoint);
}

export function beginPhoneSurfaceRoleTransaction({
  source,
  receiver,
  sessionId,
  generation
}: PhoneBoundaryGeometryOwner & Readonly<{
  source: PhoneSurfaceRoleElement;
  receiver: PhoneSurfaceRoleElement;
}>): PhoneSurfaceRoleTransaction {
  const token = {};
  const sourceBefore = snapshot(source);
  const receiverBefore = snapshot(receiver);

  const claim = (
    element: PhoneSurfaceRoleElement,
    endpoint: 'source' | 'receiver'
  ) => {
    surfaceOwner.set(element, token);
    element.dataset.phoneSurfaceRole = 'transition-endpoint';
    element.dataset.phoneBoundarySession = sessionId;
    element.dataset.phoneBoundaryGeneration = String(generation);
    element.dataset.phoneBoundaryEndpoint = endpoint;
  };
  claim(source, 'source');
  claim(receiver, 'receiver');

  const applyEndpoint = (
    element: PhoneSurfaceRoleElement,
    role: Exclude<PhoneSurfaceRole, 'transition-endpoint'>
  ) => {
    if (surfaceOwner.get(element) !== token) return;
    element.dataset.phoneSurfaceRole = role;
    delete element.dataset.phoneBoundarySession;
    delete element.dataset.phoneBoundaryGeneration;
    delete element.dataset.phoneBoundaryEndpoint;
    surfaceOwner.delete(element);
  };

  const commit = (endpoint: 'source' | 'receiver') => {
    applyEndpoint(
      source,
      endpoint === 'source' ? 'native-stable' : 'native-under-stage'
    );
    applyEndpoint(
      receiver,
      endpoint === 'receiver' ? 'native-stable' : 'native-under-stage'
    );
  };

  return {
    sessionId,
    generation,
    commit,
    rollback: () => commit('source'),
    release() {
      if (surfaceOwner.get(source) === token) {
        surfaceOwner.delete(source);
        restore(source, sourceBefore);
      }
      if (surfaceOwner.get(receiver) === token) {
        surfaceOwner.delete(receiver);
        restore(receiver, receiverBefore);
      }
    }
  };
}
