import { isSceneId, isSegmentId, type SceneId, type SegmentId } from './types';

export type InventoryTransitionSeed = {
  legacyTransitionId: string;
  segmentIds: readonly SegmentId[];
  adapterModule?: string;
  playMs?: number;
  modulePlayMs?: number;
  stageStops?: readonly number[];
  stagePlayMs?: readonly number[];
  stageHoldVh?: number;
  postScrollVh?: number;
};

export type CopyReferenceSection = {
  sectionId: string;
  canonicalScenes: readonly SceneId[];
  normalizedText: readonly string[];
};

export type InventoryManifestSeed = {
  generatedAt: string;
  transitions: readonly InventoryTransitionSeed[];
  interruptibleSegmentIds: readonly SegmentId[];
  copySections: readonly CopyReferenceSection[];
};

export type InventorySources = {
  migrationInventory: unknown;
  interruptibleCandidates: unknown;
  copyReference: unknown;
};

export type Figure2ProofEvidence = {
  segmentId: 'figure2-distance-expand';
  proofScene: 'figure2-proof';
  panelAnchors: readonly ['opening', 'cards', 'closing'];
  stageStops: readonly [0.72];
  stagePlayMs: readonly [2600, 1500];
  postScrollVh: 56;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string, path: string): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path}.${key} must be a finite number`);
  }
  return value;
}

function readNumberArray(record: Record<string, unknown>, key: string, path: string): readonly number[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error(`${path}.${key} must be an array of finite numbers`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string, path: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${path}.${key} must be a string array`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string when present`);
  }
  return value;
}

function parsePolicySeed(value: unknown, path: string) {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return {
    playMs: readNumber(value, 'playMs', path),
    modulePlayMs: readNumber(value, 'modulePlayMs', path),
    stageStops: readNumberArray(value, 'stageStops', path),
    stagePlayMs: readNumberArray(value, 'stagePlayMs', path),
    stageHoldVh: readNumber(value, 'stageHoldVh', path),
    postScrollVh: readNumber(value, 'postScrollVh', path)
  };
}

export function parseInterruptibleCandidates(input: unknown): readonly SegmentId[] {
  if (!isRecord(input)) {
    throw new Error('interruptible candidates root must be an object');
  }

  const candidates = input.interruptibleCandidates;
  if (!Array.isArray(candidates)) {
    throw new Error('interruptibleCandidates must be an array');
  }

  return candidates.map((candidate, index) => {
    if (typeof candidate !== 'string' || !isSegmentId(candidate)) {
      throw new Error(`interruptibleCandidates[${index}] must be a canonical SegmentId`);
    }
    return candidate;
  });
}

export function parseMigrationInventory(input: unknown): {
  generatedAt: string;
  transitions: readonly InventoryTransitionSeed[];
} {
  if (!isRecord(input)) {
    throw new Error('migration inventory root must be an object');
  }

  const generatedAt = readString(input, 'generatedAt', 'migrationInventory');
  const transitionsValue = input.transitions;
  if (!Array.isArray(transitionsValue)) {
    throw new Error('migrationInventory.transitions must be an array');
  }

  const transitions = transitionsValue.map((transition, index): InventoryTransitionSeed => {
    if (!isRecord(transition)) {
      throw new Error(`migrationInventory.transitions[${index}] must be an object`);
    }

    const path = `migrationInventory.transitions[${index}]`;
    const legacyTransitionId = readString(transition, 'oldTransitionId', path);
    const canonicalExpansion = readStringArray(transition, 'canonicalExpansion', path);
    const segmentIds = canonicalExpansion.filter(isSegmentId);
    const unknownCanonicalIds = canonicalExpansion.filter((item) => {
      if (item.startsWith('covered-by:') || item.startsWith('retired:')) {
        return false;
      }
      return !isSceneId(item) && !isSegmentId(item);
    });

    if (unknownCanonicalIds.length > 0) {
      throw new Error(`${path}.canonicalExpansion contains unknown canonical ids: ${unknownCanonicalIds.join(', ')}`);
    }

    const policySeed = parsePolicySeed(transition.policySeed, `${path}.policySeed`);
    const adapterModule = optionalString(transition, 'adapterModule');

    return {
      legacyTransitionId,
      segmentIds,
      ...(adapterModule ? { adapterModule } : {}),
      ...(policySeed.playMs !== undefined ? { playMs: policySeed.playMs } : {}),
      ...(policySeed.modulePlayMs !== undefined ? { modulePlayMs: policySeed.modulePlayMs } : {}),
      ...(policySeed.stageStops !== undefined ? { stageStops: policySeed.stageStops } : {}),
      ...(policySeed.stagePlayMs !== undefined ? { stagePlayMs: policySeed.stagePlayMs } : {}),
      ...(policySeed.stageHoldVh !== undefined ? { stageHoldVh: policySeed.stageHoldVh } : {}),
      ...(policySeed.postScrollVh !== undefined ? { postScrollVh: policySeed.postScrollVh } : {})
    };
  });

  return { generatedAt, transitions };
}

export function parseCopyReference(input: unknown): readonly CopyReferenceSection[] {
  if (!isRecord(input)) {
    throw new Error('copy reference root must be an object');
  }

  const sectionsValue = input.sections;
  if (!Array.isArray(sectionsValue)) {
    throw new Error('copyReference.sections must be an array');
  }

  return sectionsValue.map((section, index): CopyReferenceSection => {
    if (!isRecord(section)) {
      throw new Error(`copyReference.sections[${index}] must be an object`);
    }

    const path = `copyReference.sections[${index}]`;
    const sectionId = readString(section, 'sectionId', path);
    const canonicalScenes = readStringArray(section, 'canonicalScenes', path).map((scene, sceneIndex) => {
      if (!isSceneId(scene)) {
        throw new Error(`${path}.canonicalScenes[${sceneIndex}] must be a canonical SceneId`);
      }
      return scene;
    });
    const normalizedText = readStringArray(section, 'normalizedText', path);

    return { sectionId, canonicalScenes, normalizedText };
  });
}

export function parseInventoryManifestSeed(sources: InventorySources): InventoryManifestSeed {
  const migration = parseMigrationInventory(sources.migrationInventory);
  const interruptibleSegmentIds = parseInterruptibleCandidates(sources.interruptibleCandidates);
  const copySections = parseCopyReference(sources.copyReference);

  return {
    generatedAt: migration.generatedAt,
    transitions: migration.transitions,
    interruptibleSegmentIds,
    copySections
  };
}

export function parseFigure2ProofSequenceMarkdown(markdown: string): Figure2ProofEvidence {
  const requiredTokens = [
    'figure2-distance-expand',
    'figure2-proof-opening',
    'figure2-proof-cards',
    'figure2-proof-closing',
    'stageStops',
    '[0.72]',
    'stagePlayMs=[2600,1500]',
    'postScrollVh',
    '56'
  ];

  for (const token of requiredTokens) {
    if (!markdown.includes(token)) {
      throw new Error(`figure2 proof sequence is missing ${token}`);
    }
  }

  return {
    segmentId: 'figure2-distance-expand',
    proofScene: 'figure2-proof',
    panelAnchors: ['opening', 'cards', 'closing'],
    stageStops: [0.72],
    stagePlayMs: [2600, 1500],
    postScrollVh: 56
  };
}
