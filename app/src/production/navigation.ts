import { canonicalSceneIds } from '../story/canonical-spine';
import type { SceneId } from '../story/types';

const canonicalScenes = new Set<string>(canonicalSceneIds);

const publicAliases: Readonly<Record<string, SceneId>> = {
  '': 'hero',
  top: 'hero',
  home: 'hero',
  belief: 'star-map',
  method: 'method-top',
  brand: 'brand',
  services: 'services',
  lab: 'lab',
  education: 'education',
  contact: 'contact'
};

export const publicMenuItems = [
  { label: '首页', hash: '#home', scene: 'hero' },
  { label: '方法', hash: '#method', scene: 'method-top' },
  { label: '场景', hash: '#services', scene: 'services' },
  { label: '留学', hash: '#education', scene: 'education' },
  { label: '联系', hash: '#contact', scene: 'contact' }
] as const satisfies readonly { label: string; hash: string; scene: SceneId }[];

const preferredPublicHashes: Partial<Record<SceneId, `#${string}`>> = {
  hero: '#home',
  'method-top': '#method'
};

export function sceneFromHash(hash: string): SceneId | undefined {
  let value: string;
  try {
    value = decodeURIComponent(hash.replace(/^#/, '').trim()).toLowerCase();
  } catch {
    return undefined;
  }
  const alias = publicAliases[value];
  if (alias) {
    return alias;
  }
  return canonicalScenes.has(value) ? value as SceneId : undefined;
}

export function hashForScene(scene: SceneId): `#${string}` {
  return preferredPublicHashes[scene] ?? `#${scene}`;
}

export function sceneLabel(scene: SceneId): `scene:${SceneId}` {
  return `scene:${scene}`;
}
