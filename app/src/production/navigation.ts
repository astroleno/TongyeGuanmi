import { canonicalSceneIds } from '../story/canonical-spine';
import type { Figure2ProofPanel, SceneId } from '../story/types';

const canonicalScenes = new Set<string>(canonicalSceneIds);

const publicAliases: Readonly<Record<string, SceneId>> = {
  '': 'hero',
  top: 'hero',
  home: 'hero',
  belief: 'star-map',
  method: 'method-top',
  'figure2-proof-opening': 'figure2-proof',
  'figure2-proof-cards': 'figure2-proof',
  'figure2-proof-closing': 'figure2-proof',
  brand: 'brand',
  services: 'services',
  lab: 'lab',
  education: 'education',
  contact: 'contact'
};

const proofPanelAliases: Readonly<Record<string, Figure2ProofPanel>> = {
  'figure2-proof-opening': 'opening',
  'figure2-proof-cards': 'cards',
  'figure2-proof-closing': 'closing'
};

function normalizedHashValue(hash: string): string | undefined {
  try {
    return decodeURIComponent(hash.replace(/^#/, '').trim()).toLowerCase();
  } catch {
    return undefined;
  }
}

export const publicMenuItems = [
  { label: '首页', hash: '#home', scene: 'hero' },
  { label: '方法', hash: '#method', scene: 'method-top' },
  { label: '场景', hash: '#services', scene: 'services' },
  { label: '留学', hash: '#education', scene: 'education' },
  { label: '联系', hash: '#contact', scene: 'contact' }
] as const satisfies readonly { label: string; hash: string; scene: SceneId }[];

const preferredPublicHashes: Partial<Record<SceneId, `#${string}`>> = {
  hero: '#home',
  'method-top': '#method',
  'method-bottom': '#method'
};

export function sceneFromHash(hash: string): SceneId | undefined {
  const value = normalizedHashValue(hash);
  if (value === undefined) {
    return undefined;
  }
  const alias = publicAliases[value];
  if (alias) {
    return alias;
  }
  if (value === 'method-bottom') {
    return undefined;
  }
  return canonicalScenes.has(value) ? value as SceneId : undefined;
}

export function figure2ProofPanelFromHash(hash: string): Figure2ProofPanel | undefined {
  const value = normalizedHashValue(hash);
  return value === undefined ? undefined : proofPanelAliases[value];
}

export function hashForScene(scene: SceneId): `#${string}` {
  return preferredPublicHashes[scene] ?? `#${scene}`;
}

export function sceneLabel(scene: SceneId): `scene:${SceneId}` {
  return `scene:${scene}`;
}
