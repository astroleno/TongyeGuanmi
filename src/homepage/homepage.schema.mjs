export const expectedSceneIds = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom',
  'figure2-animation',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
];

export const expectedSegmentSpecs = [
  ['hero-to-pattern', 'ink-transition', 'hero', 'pattern', 'present-next'],
  ['pattern-to-star-map', 'ink-transition', 'pattern', 'star-map', 'present-next'],
  ['star-map-to-aod', 'ink-transition', 'star-map', 'aod-animation', 'present-next'],
  ['aod-play', 'media-animation', 'aod-animation', 'method-top', 'present-next'],
  ['method-read', 'text-read', 'method-top', 'method-bottom', 'read-complete'],
  ['method-bottom-to-figure2', 'ink-transition', 'method-bottom', 'figure2-animation', 'present-next'],
  ['figure2-compound-to-brand', 'compound-sequence', 'figure2-animation', 'brand', 'present-next'],
  ['brand-to-figure3', 'ink-transition', 'brand', 'figure3-animation', 'present-next'],
  ['figure3-play', 'media-animation', 'figure3-animation', 'services', 'present-next'],
  ['services-to-ttg', 'ink-transition', 'services', 'ttg-animation', 'present-next'],
  ['ttg-play', 'media-animation', 'ttg-animation', 'ttg-animation', 'hold-current'],
  ['ttg-to-lab', 'ink-transition', 'ttg-animation', 'lab', 'present-next'],
  ['lab-to-ph', 'ink-transition', 'lab', 'ph-animation', 'present-next'],
  ['ph-play', 'media-animation', 'ph-animation', 'ph-animation', 'hold-current'],
  ['ph-to-education', 'ink-transition', 'ph-animation', 'education', 'present-next'],
  ['education-to-crane', 'ink-transition', 'education', 'crane-animation', 'present-next'],
  ['crane-play', 'media-animation', 'crane-animation', 'contact', 'present-next']
].map(([id, type, from, to, completion]) => ({ id, type, from, to, completion }));

export const allowedSceneKinds = ['opening', 'visual', 'animation', 'reading'];
export const allowedSegmentTypes = ['ink-transition', 'media-animation', 'text-read', 'compound-sequence'];
export const allowedCompletions = ['present-next', 'read-complete', 'hold-current'];
export const expectedFigure2InternalStepIds = ['camera-expand', 'arch-with-cards', 'arch-with-closing', 'ink-sweep-to-brand'];
export const allowedHoldCurrentSegmentIds = ['ttg-play', 'ph-play'];
export const allowedEarlyCopySegments = ['aod-play', 'figure3-play', 'crane-play'];
export const forbiddenTopLevelSceneIds = [
  'philosophy',
  'method-proof',
  'figure2-proof-cards',
  'figure2-proof-closing',
  'pattern-top',
  'pattern-bottom',
  'belief-star'
];
export const forbiddenContractStringValues = ['pattern-top', 'pattern-bottom', 'belief-star'];
export const forbiddenContractKeys = [
  'handoff',
  'sourceOut',
  'targetIn',
  'commitAt',
  'presentAt',
  'cleanupAt'
];
export const requiredAliases = {
  home: { legacyHash: '#home', mapsToScene: 'hero' },
  top: { legacyHash: '#top', mapsToScene: 'hero' },
  method: { legacyHash: '#method', mapsToScene: 'method-top' },
  brand: { legacyHash: '#brand', mapsToScene: 'brand' },
  services: { legacyHash: '#services', mapsToScene: 'services' },
  lab: { legacyHash: '#lab', mapsToScene: 'lab' },
  education: { legacyHash: '#education', mapsToScene: 'education' },
  contact: { legacyHash: '#contact', mapsToScene: 'contact' },
  philosophy: { legacyHash: '#philosophy', mapsToScene: 'education' }
};
export const requiredQueryBearingRawUrls = [
  'assets/figure2-cloud-source.png?v=cloudsource3',
  'assets/figure2-middle-fresco-opaque-alpha.png?v=middlemaskhard1',
  'assets/figure2-middle-window-mask.png?v=middlemaskhard1',
  'assets/figure2a-alpha-auto.webm?v=auto2',
  'assets/figure2b-alpha-auto.webm?v=auto2',
  'assets/figure3-alpha-scrub.webm?v=1280-q40',
  'assets/ttg_front-original-overlay-alpha.png?v=ttg-front-image15-blend80-v1',
  'assets/ttg_front-alpha.png?v=ttg-front-image15-blend80-v1',
  'assets/ttg_figure-alpha-scrub.webm?v=ttg-figure-blue-v2',
  'assets/ttg_figure-alpha-scrub-poster.png?v=ttg-figure-blue-v2',
  'assets/ttg_figure-alpha-scrub-reverse.webm?v=ttg-figure-blue-v2',
  'assets/ph_figure-alpha-scrub.webm?v=allkey-1672-simple-key-20260621'
];

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function pushIf(condition, diagnostics, message) {
  if (condition) diagnostics.push(message);
}

function assertUnique(values, diagnostics, label) {
  const duplicates = [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
  pushIf(duplicates.length > 0, diagnostics, `${label} must be unique; duplicates: ${duplicates.join(', ')}`);
}

function collectForbiddenKeyHits(value, path = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeyHits(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (typeof value === 'string') {
    for (const forbiddenValue of forbiddenContractStringValues) {
      if (value.split(/\s+/).includes(forbiddenValue) || value === forbiddenValue) {
        hits.push(`${path} contains forbidden value ${forbiddenValue}`);
      }
    }
    return hits;
  }
  if (!isObject(value)) return hits;

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenContractKeys.includes(key)) hits.push(`${path}.${key}`);
    if (child === 'data-entry-owner="timeline"') hits.push(`${path}.${key}`);
    collectForbiddenKeyHits(child, `${path}.${key}`, hits);
  }
  return hits;
}

export function validateHomepageContract({
  scenes,
  sceneOrder,
  segments,
  segmentOrder,
  aliases,
  figure2InternalSteps,
  assets
}) {
  const errors = [];
  const warnings = [];

  pushIf(!Array.isArray(scenes), errors, 'homepageScenes must be an array');
  pushIf(!Array.isArray(segments), errors, 'homepageSegments must be an array');
  if (!Array.isArray(scenes) || !Array.isArray(segments)) return { errors, warnings };

  const sceneIds = scenes.map((scene) => scene.id);
  const segmentIds = segments.map((segment) => segment.id);
  assertUnique(sceneIds, errors, 'Scene ids');
  assertUnique(segmentIds, errors, 'Segment ids');

  pushIf(!Array.isArray(sceneOrder), errors, 'homepageSceneOrder must be exported and passed to the contract checker');
  pushIf(!Array.isArray(segmentOrder), errors, 'homepageSegmentOrder must be exported and passed to the contract checker');
  if (Array.isArray(sceneOrder)) {
    pushIf(JSON.stringify(sceneOrder) !== JSON.stringify(sceneIds), errors, 'homepageSceneOrder must match homepageScenes.map(scene => scene.id)');
    pushIf(JSON.stringify(sceneOrder) !== JSON.stringify(expectedSceneIds), errors, `homepageSceneOrder must be ${expectedSceneIds.join(' -> ')}`);
  }
  if (Array.isArray(segmentOrder)) {
    pushIf(JSON.stringify(segmentOrder) !== JSON.stringify(segmentIds), errors, 'homepageSegmentOrder must match homepageSegments.map(segment => segment.id)');
    pushIf(
      JSON.stringify(segmentOrder) !== JSON.stringify(expectedSegmentSpecs.map((segment) => segment.id)),
      errors,
      `homepageSegmentOrder must be ${expectedSegmentSpecs.map((segment) => segment.id).join(' -> ')}`
    );
  }

  pushIf(scenes.length !== 16, errors, `homepageScenes must declare exactly 16 top-level scenes; got ${scenes.length}`);
  pushIf(segments.length !== 17, errors, `homepageSegments must declare exactly 17 top-level segments; got ${segments.length}`);
  pushIf(JSON.stringify(sceneIds) !== JSON.stringify(expectedSceneIds), errors, `Scene order must be ${expectedSceneIds.join(' -> ')}`);
  pushIf(
    JSON.stringify(segmentIds) !== JSON.stringify(expectedSegmentSpecs.map((segment) => segment.id)),
    errors,
    `Segment order must be ${expectedSegmentSpecs.map((segment) => segment.id).join(' -> ')}`
  );

  const sceneIdSet = new Set(sceneIds);
  for (const scene of scenes) {
    pushIf(!allowedSceneKinds.includes(scene.kind), errors, `Scene ${scene.id} uses unknown kind ${scene.kind}`);
    pushIf(forbiddenTopLevelSceneIds.includes(scene.id), errors, `Forbidden top-level scene id ${scene.id}`);
    pushIf(scene.owner !== 'Presentation', errors, `Scene ${scene.id} must be committed by Presentation`);
  }

  for (const forbiddenId of forbiddenTopLevelSceneIds) {
    pushIf(sceneIdSet.has(forbiddenId), errors, `Forbidden top-level scene ${forbiddenId} must not be present`);
  }

  for (const expected of expectedSegmentSpecs) {
    const actual = segments.find((segment) => segment.id === expected.id);
    if (!actual) continue;
    for (const key of ['type', 'from', 'to', 'completion']) {
      pushIf(actual[key] !== expected[key], errors, `Segment ${expected.id} must have ${key}=${expected[key]}; got ${actual[key]}`);
    }
  }

  for (const segment of segments) {
    pushIf(!allowedSegmentTypes.includes(segment.type), errors, `Segment ${segment.id} uses unknown type ${segment.type}`);
    pushIf(!allowedCompletions.includes(segment.completion), errors, `Segment ${segment.id} uses unknown completion ${segment.completion}`);
    pushIf(!sceneIdSet.has(segment.from), errors, `Segment ${segment.id} has unknown from scene ${segment.from}`);
    pushIf(!sceneIdSet.has(segment.to), errors, `Segment ${segment.id} has unknown to scene ${segment.to}`);

    if (segment.from === segment.to) {
      pushIf(segment.type !== 'media-animation', errors, `Only media-animation may hold current scene; ${segment.id} is ${segment.type}`);
      pushIf(segment.completion !== 'hold-current', errors, `Hold segment ${segment.id} must use completion=hold-current`);
      pushIf(!allowedHoldCurrentSegmentIds.includes(segment.id), errors, `Only ttg-play and ph-play may use hold-current; got ${segment.id}`);
    }

    if (segment.completion === 'hold-current') {
      pushIf(!allowedHoldCurrentSegmentIds.includes(segment.id), errors, `Only ttg-play and ph-play may use hold-current; got ${segment.id}`);
      pushIf(segment.from !== segment.to, errors, `Hold-current segment ${segment.id} must keep from === to`);
    }

    if ('earlyCopyAt' in segment) {
      pushIf(!allowedEarlyCopySegments.includes(segment.id), errors, `earlyCopyAt is only allowed on ${allowedEarlyCopySegments.join(', ')}; got ${segment.id}`);
      pushIf(segment.earlyCopyAt !== 0.8, errors, `Segment ${segment.id} earlyCopyAt must be exactly 0.8`);
      pushIf(segment.completion !== 'present-next', errors, `Segment ${segment.id} with earlyCopyAt must still complete with present-next`);
    }
  }

  const methodRead = segments.find((segment) => segment.id === 'method-read');
  if (methodRead) {
    pushIf(methodRead.type !== 'text-read', errors, 'method-read must be a text-read segment');
    pushIf(methodRead.read?.driver !== 'ReadMonitor', errors, 'method-read must be driven by ReadMonitor');
    pushIf(methodRead.lockScroll !== false, errors, 'method-read must not lock scroll');
    pushIf(methodRead.player !== null, errors, 'method-read must not call a visual player');
    pushIf('distanceVh' in methodRead || methodRead.intent?.distanceVh === 0, errors, 'method-read must not use a distanceVh: 0 animation shortcut');
  }

  const compoundSegments = segments.filter((segment) => segment.type === 'compound-sequence');
  pushIf(compoundSegments.length !== 1, errors, `Figure2 must be the only top-level compound segment; got ${compoundSegments.length}`);
  pushIf(compoundSegments[0]?.id !== 'figure2-compound-to-brand', errors, 'The only compound segment must be figure2-compound-to-brand');

  const internalStepIds = (figure2InternalSteps || []).map((step) => step.id);
  pushIf(
    JSON.stringify(internalStepIds) !== JSON.stringify(expectedFigure2InternalStepIds),
    errors,
    `Figure2 internal steps must be ${expectedFigure2InternalStepIds.join(' -> ')}`
  );
  for (const internalId of ['method-proof', 'figure2-proof-cards', 'figure2-proof-closing']) {
    pushIf(sceneIdSet.has(internalId), errors, `${internalId} may only be a content ref/internal step, not a top-level scene`);
    pushIf(segmentIds.includes(internalId), errors, `${internalId} may not be a top-level segment`);
  }

  for (const scene of scenes.filter((scene) => scene.kind === 'animation')) {
    const playSegment = segments.find((segment) => segment.id === scene.playSegmentId);
    pushIf(!playSegment, errors, `Animation scene ${scene.id} must declare an independent play/compound segment`);
    pushIf(playSegment && playSegment.from !== scene.id, errors, `Animation scene ${scene.id} play segment must start from itself`);
    pushIf(
      playSegment && !['media-animation', 'compound-sequence'].includes(playSegment.type),
      errors,
      `Animation scene ${scene.id} play segment must be media-animation or compound-sequence`
    );
  }

  const aliasSceneIds = new Set(sceneIds);
  for (const [name, alias] of Object.entries(aliases || {})) {
    pushIf(!alias.legacyHash?.startsWith('#'), errors, `Alias ${name} must declare legacyHash`);
    pushIf(!aliasSceneIds.has(alias.mapsToScene), errors, `Alias ${name} maps to unknown scene ${alias.mapsToScene}`);
  }
  for (const [name, expectedAlias] of Object.entries(requiredAliases)) {
    const actual = aliases?.[name];
    pushIf(!actual, errors, `Missing required alias ${name}`);
    if (!actual) continue;
    pushIf(actual.legacyHash !== expectedAlias.legacyHash, errors, `Alias ${name} must preserve ${expectedAlias.legacyHash}`);
    pushIf(actual.mapsToScene !== expectedAlias.mapsToScene, errors, `Alias ${expectedAlias.legacyHash} must map to ${expectedAlias.mapsToScene}`);
  }
  pushIf(aliases?.philosophy?.legacyHash !== '#philosophy', errors, 'Alias philosophy must preserve #philosophy');
  pushIf(aliases?.philosophy?.mapsToScene !== 'education', errors, 'Alias #philosophy must map to education');

  const forbiddenKeyHits = collectForbiddenKeyHits({ scenes, segments, aliases, figure2InternalSteps });
  pushIf(forbiddenKeyHits.length > 0, errors, `Forbidden legacy contract keys/values found: ${forbiddenKeyHits.join(', ')}`);

  const assetRawUrls = new Set((assets || []).map((asset) => asset.rawUrl));
  for (const rawUrl of requiredQueryBearingRawUrls) {
    pushIf(!assetRawUrls.has(rawUrl), errors, `homepage.assets.mjs must preserve query-bearing rawUrl ${rawUrl}`);
  }
  assertUnique((assets || []).map((asset) => asset.id), errors, 'Asset ids');
  assertUnique((assets || []).map((asset) => asset.rawUrl), warnings, 'Asset rawUrls');

  return { errors, warnings };
}
