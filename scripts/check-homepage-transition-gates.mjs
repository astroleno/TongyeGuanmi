#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const REQUIRED_DESKTOP_MODES = ['fresh-page', 'same-page-forward', 'same-page-reverse', 'direct-jump'];
const EXPECTED_USER_ISSUES = Array.from({ length: 19 }, (_, issue) => issue);

const GATE_ORDER = [
  gateNavBlurDepth,
  gateHomePatternNoDarkGap,
  gateBeliefManifestoCopy,
  gateBeliefStarSplit,
  gateBeliefAodEntryV31,
  gateAodSceneVisible,
  gateAodMethodReceiver,
  gateMethodFigure2Entry,
  gateFigure2ExitNoBlank,
  gateFigure3ServicesReceiver,
  gateServicesTtgLabSplit,
  gateLabIndependentDividers,
  gateLabColumnRhythm,
  gateLabPhEducationSplit,
  gateEducationIndependentDividers,
  gateEducationColumnRhythm,
  gatePhilosophyNoEmptyField,
  gateCraneContactReceiver,
  gateContactEndpointReal
];

function parseArgs(argv) {
  const options = {
    input: '',
    write: false,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[index += 1] || '';
    else if (arg.startsWith('--input=')) options.input = arg.slice('--input='.length);
    else if (arg === '--write') options.write = true;
    else if (arg === '--strict') options.strict = true;
  }

  if (!options.input) {
    throw new Error('Missing --input <output/playwright/.../homepage-checkpoints.json>');
  }

  return options;
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function viewportRef(sample) {
  return `${sample.viewport?.width || 'unknown'}x${sample.viewport?.height || 'unknown'}`;
}

function evidenceRef(sample) {
  return `${sample.captureMode || 'unknown'}:desktop-${viewportRef(sample)}:${sample.requestedY}`;
}

function requiredDesktopSamplesForIssue(report, issue) {
  const row = (report.crosswalkEvidence || []).find((item) => item.issue === issue);
  const checkpoints = row?.checkpoints || [];
  const samples = (report.samples || []).filter((sample) => (
    sample.viewport?.width === 1440
    && sample.viewport?.height === 840
    && checkpoints.includes(sample.requestedY)
  ));

  const missing = [];
  for (const requestedY of checkpoints) {
    for (const captureMode of REQUIRED_DESKTOP_MODES) {
      if (!samples.some((sample) => sample.requestedY === requestedY && sample.captureMode === captureMode)) {
        missing.push(`${captureMode}:desktop-1440x840:${requestedY}`);
      }
    }
  }

  return { row, checkpoints, samples, missing };
}

function resultFor({ report, issue, gate, criteria, check }) {
  const { row, samples, missing } = requiredDesktopSamplesForIssue(report, issue);
  const failures = [];
  const evidenceRefs = samples.map(evidenceRef);

  if (!row) {
    failures.push(`Issue #${issue} has no crosswalk row.`);
  }

  if (missing.length > 0) {
    failures.push(`Missing required desktop samples: ${missing.join(', ')}`);
  }

  if (row && missing.length === 0) {
    failures.push(...check({ row, samples }));
  }

  return {
    issue,
    status: failures.length ? 'failed' : 'passed',
    gate,
    criteria,
    evidenceRefs,
    missingEvidenceRefs: missing,
    failures
  };
}

function samplesAt(samples, requestedY) {
  return samples.filter((sample) => sample.requestedY === requestedY);
}

function activeInk(sample, transitionId, kind) {
  return (sample.inkSurfaces || []).some((surface) => (
    surface.transitionId === transitionId
    && surface.kind === kind
    && surface.active === true
    && surface.activePixelRatioSource === 'sampled-canvas'
  ));
}

function anyActiveInk(sample, transitionIds, kinds = ['entryInk', 'exitInk', 'paperWash']) {
  return transitionIds.some((transitionId) => kinds.some((kind) => activeInk(sample, transitionId, kind)));
}

function transitionContextFor(sample, transitionId) {
  if (sample.transitionContext?.transitionId === transitionId) return sample.transitionContext;
  const scene = (sample.scenes || []).find((item) => item.transitionId === transitionId);
  if (!scene) return null;
  return {
    transitionId,
    phase: scene.phase || 'none',
    bridgeType: scene.bridgeType || 'none',
    progress: number(scene.progress, null),
    sceneOpacity: number(scene.sceneOpacity ?? scene.opacity, null),
    receiverOpacity: number(scene.receiverOpacity, null),
    inkProgress: number(scene.inkProgress, null),
    foregroundOpacity: number(scene.foregroundOpacity, null)
  };
}

function sceneOpacity(sample, transitionId) {
  const context = transitionContextFor(sample, transitionId);
  return number(context?.sceneOpacity, 0);
}

function foregroundOpacity(sample, transitionId) {
  const context = transitionContextFor(sample, transitionId);
  return number(context?.foregroundOpacity, number(sample.overlap?.dominantForeground?.opacity, 0));
}

function receiverOpacity(sample, transitionId) {
  const exactReceiver = (sample.receivers || []).find((receiver) => {
    const source = receiver.source || receiver.handoffSource || '';
    const selector = receiver.selector || '';
    return source.includes(transitionId) || selector.includes(transitionId);
  });
  if (exactReceiver) return number(exactReceiver.handoffProgress ?? exactReceiver.opacity, 0);

  const context = transitionContextFor(sample, transitionId);
  return number(context?.receiverOpacity, 0);
}

function copyState(sample, copyId) {
  if (sample.copy?.id === copyId) return sample.copy.primary || null;
  return (sample.copy?.all || []).find((copy) => copy.copyId === copyId) || null;
}

function copyVisible(sample, copyId, opacity = 0.35) {
  const copy = copyState(sample, copyId);
  return Boolean(copy && number(copy.opacity, 0) >= opacity && number(copy.visibleRatio, 0) > 0);
}

function anyCopyVisible(sample, opacity = 0.35) {
  return sample.copy?.id !== 'none'
    && number(sample.copy?.primary?.opacity, 0) >= opacity
    && number(sample.copy?.primary?.visibleRatio, 0) > 0;
}

function hasActiveScene(sample, transitionId, opacity = 0.18) {
  return sceneOpacity(sample, transitionId) >= opacity;
}

function lineOwnerFailures(samples, label) {
  const failures = [];
  for (const sample of samples) {
    const owners = sample.boundaries?.lineOwners || [];
    const visibleOwners = owners.filter((owner) => number(owner.width, 0) >= 0.75);
    if (visibleOwners.some((owner) => !owner.owner)) {
      failures.push(`${evidenceRef(sample)} has a visible horizontal line without owner.`);
    }
    for (let left = 0; left < visibleOwners.length; left += 1) {
      for (let right = left + 1; right < visibleOwners.length; right += 1) {
        const a = visibleOwners[left];
        const b = visibleOwners[right];
        if (Math.abs(number(a.y) - number(b.y)) <= 1.5 && a.owner !== b.owner) {
          failures.push(`${evidenceRef(sample)} has duplicate ${label} line owners near y=${a.y}: ${a.owner} and ${b.owner}.`);
        }
      }
    }
  }
  return failures;
}

function sampleSplitBridges(sample, transitionId = '') {
  return (sample.splitBridges || []).filter((bridge) => (
    bridge.active === true
    && (!transitionId || bridge.transitionId === transitionId)
  ));
}

function hasSplitEvidence(sample, { transitionId = '', topOwner = '', bottomOwner = '' } = {}) {
  const acceptedSources = new Set(['sampled-canvas', 'sampled-screenshot', 'sampled-dom-geometry']);
  return sampleSplitBridges(sample, transitionId).some((bridge) => {
    const topMatches = !topOwner || bridge.claimedTopOwner === topOwner;
    const bottomMatches = !bottomOwner || bridge.claimedBottomOwner === bottomOwner;
    return topMatches
      && bottomMatches
      && number(bridge.previousTopPixelRatio, 0) >= 0.015
      && number(bridge.nextBottomPixelRatio, 0) >= 0.015
      && acceptedSources.has(bridge.previousTopPixelRatioSource)
      && acceptedSources.has(bridge.nextBottomPixelRatioSource)
      && bridge.claimedTopOwner
      && bridge.claimedBottomOwner
      && bridge.claimedTopOwner !== bridge.claimedBottomOwner
      && bridge.topOwnerElementHit === true
      && bridge.bottomOwnerElementHit === true;
  });
}

function requireSomeSplit(samples, options, label) {
  return samples.some((sample) => hasSplitEvidence(sample, options))
    ? []
    : [`No required splitSceneBridge evidence found for ${label}.`];
}

function noBlankOwnerFailures(samples, label) {
  return samples.flatMap((sample) => {
    const hasBridge = sampleSplitBridges(sample).length > 0;
    const hasCopy = anyCopyVisible(sample, 0.25);
    const hasActiveHome = sample.activeSection?.id === 'home' && number(sample.activeSection?.visibleRatio, 0) > 0.2;
    const hasCanvas = (sample.canvases || []).some((canvas) => number(canvas.visibleRatio, 0) > 0.2 && number(canvas.opacity, 1) > 0.01);
    const hasScene = Boolean(sample.activeTransition?.id && sample.activeTransition.phase !== 'none' && sceneOpacity(sample, sample.activeTransition.id) >= 0.18);
    const hasInk = (sample.inkSurfaces || []).some((surface) => surface.active === true);
    return hasBridge || hasCopy || hasScene || hasInk || hasActiveHome || hasCanvas
      ? []
      : [`${evidenceRef(sample)} has no visible ${label} owner, bridge, scene, copy, or sampled ink.`];
  });
}

function gateNavBlurDepth(report) {
  return resultFor({
    report,
    issue: 0,
    gate: 'nav-blur-depth',
    criteria: ['nav-visible', 'blur-height-about-two-nav-heights'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const ratio = number(sample.nav?.blurToNavHeightRatio, 0);
      const failures = [];
      if (sample.nav?.navVisible === true && sample.nav?.blurVisible !== true) {
        failures.push(`${evidenceRef(sample)} nav is visible but nav blur band is not visible.`);
      }
      if (ratio < 1.85) failures.push(`${evidenceRef(sample)} blur/nav height ratio ${ratio} is below 1.85.`);
      return failures;
    })
  });
}

function gateHomePatternNoDarkGap(report) {
  return resultFor({
    report,
    issue: 1,
    gate: 'home-pattern-no-dark-gap',
    criteria: ['pattern-or-copy-visible', 'no-empty-dark-hold'],
    check: ({ samples }) => noBlankOwnerFailures(samples, 'Home/Pattern')
  });
}

function gateBeliefManifestoCopy(report) {
  return resultFor({
    report,
    issue: 2,
    gate: 'belief-manifesto-copy',
    criteria: ['belief-main-copy-visible', 'manifesto-note-visible'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const manifesto = sample.copyMetrics?.beliefManifesto;
      const projectedBelief = hasSplitEvidence(sample, { transitionId: 'home-belief', topOwner: 'belief' });
      const failures = [];
      if (!copyVisible(sample, 'belief', 0.25) && !projectedBelief) failures.push(`${evidenceRef(sample)} Belief main copy is not visible enough.`);
      if (!projectedBelief && (!manifesto || number(manifesto.opacity, 0) < 0.25 || number(manifesto.visibleRatio, 0) <= 0)) {
        failures.push(`${evidenceRef(sample)} Belief manifesto note is not visible.`);
      }
      return failures;
    })
  });
}

function gateBeliefStarSplit(report) {
  return resultFor({
    report,
    issue: 3,
    gate: 'belief-star-split',
    criteria: ['staged-belief-copy-or-star', 'split-bridge-evidence'],
    check: ({ samples }) => [
      ...noBlankOwnerFailures(samples, 'Belief star'),
      ...requireSomeSplit(samples, { transitionId: 'home-belief', topOwner: 'belief' }, 'Belief star split')
    ]
  });
}

function gateBeliefAodEntryV31(report) {
  return resultFor({
    report,
    issue: 4,
    gate: 'belief-aod-entry',
    criteria: ['belief-to-aod-split', 'aod-first-frame'],
    check: ({ samples }) => [
      ...requireSomeSplit(samples, { transitionId: 'belief-method', topOwner: 'belief', bottomOwner: 'aod' }, 'Belief -> AOD'),
      ...noBlankOwnerFailures(samples, 'Belief/AOD')
    ]
  });
}

function gateAodSceneVisible(report) {
  return resultFor({
    report,
    issue: 5,
    gate: 'aod-scene-visible',
    criteria: ['aod-primary-scene-visible', 'belief-star-not-covering-aod'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const aodVisible = hasActiveScene(sample, 'belief-method', 0.20)
        || hasSplitEvidence(sample, { transitionId: 'belief-method', bottomOwner: 'aod' })
        || (transitionContextFor(sample, 'belief-method')?.bridgeType === 'earlyReceiver'
          && number(transitionContextFor(sample, 'belief-method')?.receiverOpacity, 0) >= 0.45
          && number((sample.scenes || []).find((scene) => scene.transitionId === 'belief-method')?.visibleRatio, 0) > 0.04);
      return aodVisible ? [] : [`${evidenceRef(sample)} has no AOD scene or AOD split evidence.`];
    })
  });
}

function gateAodMethodReceiver(report) {
  return resultFor({
    report,
    issue: 6,
    gate: 'aod-method-receiver',
    criteria: ['method-projection-readable-before-aod-exit'],
    check: ({ samples }) => {
      const orderingOk = samples.some((sample) => (
        receiverOpacity(sample, 'belief-method') >= 0.45
        && (sceneOpacity(sample, 'belief-method') >= 0.20
          || sampleSplitBridges(sample, 'belief-method').length > 0
          || number((sample.scenes || []).find((scene) => scene.transitionId === 'belief-method')?.visibleRatio, 0) > 0.04)
      ));
      return orderingOk ? [] : ['No sample shows Method receiver opacity >= 0.45 while AOD remains visible.'];
    }
  });
}

function gateMethodFigure2Entry(report) {
  return resultFor({
    report,
    issue: 7,
    gate: 'method-figure2-entry',
    criteria: ['method-to-figure2-split'],
    check: ({ samples }) => [
      ...requireSomeSplit(samples, { transitionId: 'method-tooling__method-proof', topOwner: 'method', bottomOwner: 'figure2' }, 'Method -> Figure2'),
      ...noBlankOwnerFailures(samples, 'Method/Figure2')
    ]
  });
}

function gateFigure2ExitNoBlank(report) {
  return resultFor({
    report,
    issue: 8,
    gate: 'figure2-exit-no-blank',
    criteria: ['figure2-to-brand-split-or-receiver', 'no-blank-before-brand'],
    check: ({ samples }) => {
      const splitOk = samples.some((sample) => (
        hasSplitEvidence(sample, { transitionId: 'method-tooling__method-proof', topOwner: 'figure2', bottomOwner: 'brand' })
        || receiverOpacity(sample, 'method-tooling__method-proof') >= 0.35
      ));
      return [
        ...(splitOk ? [] : ['No sample shows Figure2 -> Brand split or receiver evidence.']),
        ...noBlankOwnerFailures(samples, 'Figure2/Brand')
      ];
    }
  });
}

function gateFigure3ServicesReceiver(report) {
  return resultFor({
    report,
    issue: 9,
    gate: 'figure3-services-receiver',
    criteria: ['services-projection-during-figure3-final-window'],
    check: ({ samples }) => {
      const orderingOk = samples.some((sample) => (
        receiverOpacity(sample, 'brand-services') >= 0.45
        && sceneOpacity(sample, 'brand-services') >= 0.20
      ));
      return orderingOk ? [] : ['No sample shows Services receiver opacity >= 0.45 while Figure3 remains visible.'];
    }
  });
}

function gateServicesTtgLabSplit(report) {
  return resultFor({
    report,
    issue: 10,
    gate: 'services-ttg-lab-split',
    criteria: ['services-to-ttg-split', 'ttg-to-lab-split'],
    check: ({ samples }) => [
      ...requireSomeSplit(samples, { transitionId: 'services-lab', topOwner: 'services', bottomOwner: 'ttg' }, 'Services -> TTG'),
      ...requireSomeSplit(samples, { transitionId: 'services-lab', topOwner: 'ttg', bottomOwner: 'lab' }, 'TTG -> Lab')
    ]
  });
}

function gateLabIndependentDividers(report) {
  return resultFor({
    report,
    issue: 11,
    gate: 'lab-independent-dividers',
    criteria: ['single-horizontal-line-owner'],
    check: ({ samples }) => lineOwnerFailures(samples, 'Lab')
  });
}

function gateLabColumnRhythm(report) {
  return resultFor({
    report,
    issue: 12,
    gate: 'lab-column-rhythm',
    criteria: ['lab-right-column-top-within-24px'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const delta = sample.layoutMetrics?.labRhythmDeltaPx ?? sample.layoutMetrics?.rhythmDeltaPx;
      if (!Number.isFinite(delta)) return [`${evidenceRef(sample)} lacks captured labRhythmDeltaPx.`];
      return Math.abs(delta) <= 24 ? [] : [`${evidenceRef(sample)} has Lab right/left top delta ${delta}px, above 24px.`];
    })
  });
}

function gateLabPhEducationSplit(report) {
  return resultFor({
    report,
    issue: 13,
    gate: 'lab-ph-education-split',
    criteria: ['lab-to-ph-split', 'ph-to-education-split'],
    check: ({ samples }) => [
      ...requireSomeSplit(samples, { transitionId: 'lab-education', topOwner: 'lab', bottomOwner: 'ph' }, 'Lab -> PH'),
      ...requireSomeSplit(samples, { transitionId: 'lab-education', topOwner: 'ph', bottomOwner: 'education' }, 'PH -> Education')
    ]
  });
}

function gateEducationIndependentDividers(report) {
  return resultFor({
    report,
    issue: 14,
    gate: 'education-independent-dividers',
    criteria: ['single-horizontal-line-owner'],
    check: ({ samples }) => lineOwnerFailures(samples, 'Education')
  });
}

function gateEducationColumnRhythm(report) {
  return resultFor({
    report,
    issue: 15,
    gate: 'education-column-rhythm',
    criteria: ['education-right-column-top-within-24px'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const delta = sample.layoutMetrics?.educationRhythmDeltaPx ?? sample.layoutMetrics?.rhythmDeltaPx;
      if (!Number.isFinite(delta)) return [`${evidenceRef(sample)} lacks captured educationRhythmDeltaPx.`];
      return Math.abs(delta) <= 24 ? [] : [`${evidenceRef(sample)} has Education right/left top delta ${delta}px, above 24px.`];
    })
  });
}

function gatePhilosophyNoEmptyField(report) {
  return resultFor({
    report,
    issue: 16,
    gate: 'philosophy-no-empty-field',
    criteria: ['philosophy-or-crane-or-split-owner-present'],
    check: ({ samples }) => noBlankOwnerFailures(samples, 'Philosophy/Crane')
  });
}

function gateCraneContactReceiver(report) {
  return resultFor({
    report,
    issue: 17,
    gate: 'crane-contact-receiver',
    criteria: ['philosophy-to-crane-split', 'contact-receiver-before-crane-exit'],
    check: ({ samples }) => {
      const receiverOk = samples.some((sample) => (
        receiverOpacity(sample, 'philosophy-contact') >= 0.40
        && sceneOpacity(sample, 'philosophy-contact') >= 0.20
      ));
      return [
        ...requireSomeSplit(samples, { transitionId: 'philosophy-contact', topOwner: 'philosophy', bottomOwner: 'crane' }, 'Philosophy -> Crane'),
        ...(receiverOk ? [] : ['No sample shows Contact receiver opacity >= 0.40 while Crane remains visible.'])
      ];
    }
  });
}

function gateContactEndpointReal(report) {
  return resultFor({
    report,
    issue: 18,
    gate: 'contact-endpoint-real',
    criteria: ['contact-only-endpoint', 'cta-readable-and-non-placeholder'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const endpoint = sample.endpoint || {};
      const spec = endpoint.chosenEndpointSpec || {};
      const href = endpoint.primaryCtaHref || '';
      const failures = [];
      if ((spec.mode || 'undecided') === 'undecided') failures.push(`${evidenceRef(sample)} endpoint mode is undecided.`);
      if (!spec.snapTarget) failures.push(`${evidenceRef(sample)} endpoint snapTarget is empty.`);
      if (!spec.approvalSource) failures.push(`${evidenceRef(sample)} endpoint approvalSource is missing.`);
      if (!href || href.includes('contact@example.com') || href === '#contact' || href === '#') {
        failures.push(`${evidenceRef(sample)} Contact primary CTA href is placeholder/no-op: ${href || '(empty)'}.`);
      }
      if (number(endpoint.primaryCtaOpacity, 0) < 0.8) failures.push(`${evidenceRef(sample)} Contact primary CTA opacity is below 0.8.`);
      return failures;
    })
  });
}

function gateHomeDarkFrame(report) {
  return resultFor({
    report,
    issue: 1,
    gate: 'home-belief',
    criteria: ['no-empty-dark-frame', 'copy-or-visual-present'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const hasCopy = sample.copy?.id !== 'none' && number(sample.copy?.primary?.opacity, 0) > 0.03;
      const hasInk = anyActiveInk(sample, ['home-belief'], ['entryInk', 'exitInk']);
      const hasScene = hasActiveScene(sample, 'home-belief', 0.18);
      return hasCopy || hasInk || hasScene
        ? []
        : [`${evidenceRef(sample)} has copy=none and no active Home/Belief ink or scene surface.`];
    })
  });
}

function gateBeliefPatternBloom(report) {
  return resultFor({
    report,
    issue: 2,
    gate: 'home-belief',
    criteria: ['belief-copy-visible-by-1310', 'scene-continuity-at-1699'],
    check: ({ samples }) => {
      const failures = [];
      for (const sample of samplesAt(samples, 1310)) {
        const hasBelief = copyVisible(sample, 'belief', 0.35);
        const hasInkOrScene = anyActiveInk(sample, ['home-belief'], ['entryInk', 'exitInk'])
          || hasActiveScene(sample, 'home-belief', 0.18);
        if (!hasBelief && !hasInkOrScene) {
          failures.push(`${evidenceRef(sample)} lacks Belief copy opacity >= 0.35 and active Home/Belief scene or ink.`);
        }
      }
      for (const sample of samplesAt(samples, 1699)) {
        const disconnected = sample.copy?.id === 'none'
          && !anyActiveInk(sample, ['home-belief'], ['entryInk', 'exitInk'])
          && !hasActiveScene(sample, 'home-belief', 0.18);
        if (disconnected) failures.push(`${evidenceRef(sample)} is a disconnected no-copy/no-scene/no-ink frame.`);
      }
      return failures;
    }
  });
}

function gateBeliefAodEntry(report) {
  return resultFor({
    report,
    issue: 3,
    gate: 'belief-aod-entry',
    criteria: ['active-ink-bridge-at-1843-2327', 'aod-scene-takeover-at-2937', 'no-no-copy-limbo'],
    check: ({ samples }) => {
      const failures = [];
      for (const requestedY of [1843, 2327]) {
        for (const sample of samplesAt(samples, requestedY)) {
          if (!anyActiveInk(sample, ['home-belief'], ['exitInk']) && !anyActiveInk(sample, ['belief-method'], ['entryInk'])) {
            failures.push(`${evidenceRef(sample)} has no active Home/Belief exitInk or AOD entryInk bridge.`);
          }
        }
      }
      for (const sample of samplesAt(samples, 2937)) {
        const aodContext = transitionContextFor(sample, 'belief-method');
        const phaseOk = ['scene', 'copyIn', 'copyHold'].includes(aodContext?.phase || '')
          && number(aodContext?.sceneOpacity, 0) >= 0.25;
        const bridgeOk = anyActiveInk(sample, ['home-belief'], ['exitInk'])
          || anyActiveInk(sample, ['belief-method'], ['entryInk']);
        if (!phaseOk && !bridgeOk) {
          failures.push(`${evidenceRef(sample)} has neither bridge ink nor AOD scene takeover evidence.`);
        }
      }
      for (const sample of samples) {
        const aodScene = hasActiveScene(sample, 'belief-method', 0.25);
        const bridge = anyActiveInk(sample, ['home-belief'], ['exitInk'])
          || anyActiveInk(sample, ['belief-method'], ['entryInk']);
        if (sample.copy?.id === 'none' && !aodScene && !bridge) {
          failures.push(`${evidenceRef(sample)} is no-copy limbo without bridge ink or AOD scene.`);
        }
        if (Math.abs(number(sample.actualY) - number(sample.requestedY)) > 1200) {
          failures.push(`${evidenceRef(sample)} has an unexplained actualY jump from ${sample.requestedY} to ${sample.actualY}.`);
        }
      }
      return failures;
    }
  });
}

function gateAodMethod(report) {
  return resultFor({
    report,
    issue: 4,
    gate: 'aod-method',
    criteria: ['receiver-before-scene-exit', 'method-copy-safe-zone'],
    check: ({ samples }) => {
      const failures = [];
      const orderingOk = samples.some((sample) => (
        receiverOpacity(sample, 'belief-method') >= 0.55
        && sceneOpacity(sample, 'belief-method') >= 0.25
      ));
      if (!orderingOk) {
        failures.push('No sample shows Method receiver opacity >= 0.55 while AOD scene opacity is still >= 0.25.');
      }
      for (const sample of samplesAt(samples, 5368)) {
        const methodCopy = copyState(sample, 'method');
        if (!methodCopy || number(methodCopy.opacity, 0) < 0.55 || methodCopy.safeMargin !== true) {
          failures.push(`${evidenceRef(sample)} lacks safe Method copy with opacity >= 0.55.`);
        }
      }
      return failures;
    }
  });
}

function gateFigure2Entry(report) {
  return resultFor({
    report,
    issue: 5,
    gate: 'figure2-entry',
    criteria: ['named-figure2-phase', 'active-figure2-ink-or-copy'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const context = transitionContextFor(sample, 'method-tooling__method-proof');
      const namedPhase = Boolean(context?.phase && context.phase !== 'none');
      const visualEvidence = anyActiveInk(sample, ['method-tooling__method-proof'], ['entryInk', 'exitInk'])
        || anyCopyVisible(sample, 0.35);
      return namedPhase && visualEvidence
        ? []
        : [`${evidenceRef(sample)} lacks named Figure2 phase with active ink or visible copy.`];
    })
  });
}

function gateFigure2Copy(report) {
  return resultFor({
    report,
    issue: 6,
    gate: 'figure2-copy',
    criteria: ['proof-copy-opacity', 'foreground-overlap-limit'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const proofCopy = copyState(sample, 'proof') || sample.copy?.primary;
      const copyOpacity = number(proofCopy?.opacity, 0);
      const overlapRatio = number(sample.overlap?.overlapRatio, 1);
      const failures = [];
      if (copyOpacity < 0.8) failures.push(`${evidenceRef(sample)} proof copy opacity ${copyOpacity} is below 0.80.`);
      if (overlapRatio > 0.1) failures.push(`${evidenceRef(sample)} foreground overlap ratio ${overlapRatio} is above 0.10.`);
      return failures;
    })
  });
}

function gateFigure2ExitFigure3(report) {
  return resultFor({
    report,
    issue: 7,
    gate: 'figure2-exit-figure3',
    criteria: ['no-proof-receiver-foreground-stack', 'foreground-retreat-before-receiver'],
    check: ({ samples }) => {
      const failures = [];
      for (const sample of samples) {
        const proofOpacity = number((copyState(sample, 'proof') || sample.copy?.primary)?.opacity, 0);
        const receiver = Math.max(
          receiverOpacity(sample, 'method-tooling__method-proof'),
          receiverOpacity(sample, 'brand-services')
        );
        const foreground = foregroundOpacity(sample, 'method-tooling__method-proof');
        const hasInk = anyActiveInk(sample, ['method-tooling__method-proof', 'brand-services'], ['entryInk', 'exitInk']);
        if (proofOpacity >= 0.35 && receiver >= 0.35 && foreground >= 0.25 && !hasInk) {
          failures.push(`${evidenceRef(sample)} stacks proof copy, receiver, and foreground without active ink.`);
        }
      }
      const forwardSamples = samples
        .filter((sample) => sample.captureMode === 'same-page-forward')
        .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
      const receiverIndex = forwardSamples.findIndex((sample) => (
        Math.max(receiverOpacity(sample, 'method-tooling__method-proof'), receiverOpacity(sample, 'brand-services')) >= 0.65
      ));
      if (receiverIndex >= 0) {
        const foregroundRetreated = forwardSamples
          .slice(0, receiverIndex + 1)
          .some((sample) => foregroundOpacity(sample, 'method-tooling__method-proof') < 0.25);
        if (!foregroundRetreated) {
          failures.push('Same-page-forward evidence never shows Figure2 foreground opacity below 0.25 before Brand/Figure3 receiver reaches opacity >= 0.65.');
        }
      } else {
        failures.push('Same-page-forward evidence never shows Brand/Figure3 receiver opacity >= 0.65.');
      }
      return failures;
    }
  });
}

function gateFigure3Services(report) {
  return resultFor({
    report,
    issue: 8,
    gate: 'figure3-services',
    criteria: ['services-receiver-before-figure3-exit'],
    check: ({ samples }) => {
      const orderingOk = samples.some((sample) => (
        receiverOpacity(sample, 'brand-services') >= 0.5
        && sceneOpacity(sample, 'brand-services') >= 0.3
      ));
      return orderingOk ? [] : ['No sample shows Services receiver opacity >= 0.50 before Figure3 scene opacity drops below 0.30.'];
    }
  });
}

function gateTtgLab(report) {
  return resultFor({
    report,
    issue: 9,
    gate: 'ttg-lab',
    criteria: ['active-ttg-ink', 'lab-visible-before-ttg-exit'],
    check: ({ samples }) => {
      const failures = [];
      for (const sample of samples) {
        if (!anyActiveInk(sample, ['services-lab'], ['entryInk', 'exitInk', 'paperWash'])) {
          failures.push(`${evidenceRef(sample)} lacks active TTG entry/exit ink.`);
        }
      }
      const labVisible = samples.some((sample) => (
        (copyVisible(sample, 'lab', 0.35) || receiverOpacity(sample, 'services-lab') >= 0.35)
        && sceneOpacity(sample, 'services-lab') >= 0.3
      ));
      if (!labVisible) failures.push('No sample shows Lab receiver/copy visibility before TTG scene exit.');
      return failures;
    }
  });
}

function gateTtgLabDivider(report) {
  return resultFor({
    report,
    issue: 10,
    gate: 'ttg-lab-divider',
    criteria: ['single-horizontal-line-owner'],
    check: ({ samples }) => lineOwnerFailures(samples, 'TTG/Lab')
  });
}

function gateColumnRhythm(report) {
  return resultFor({
    report,
    issue: 11,
    gate: 'column-rhythm',
    criteria: ['right-column-top-within-24px'],
    check: ({ samples }) => samples.flatMap((sample) => {
      const delta = sample.layoutMetrics?.rhythmDeltaPx;
      if (!Number.isFinite(delta)) return [`${evidenceRef(sample)} lacks captured rhythmDeltaPx.`];
      return Math.abs(delta) <= 24
        ? []
        : [`${evidenceRef(sample)} has right/left top delta ${delta}px, above 24px.`];
    })
  });
}

function gatePhEducation(report) {
  return resultFor({
    report,
    issue: 12,
    gate: 'ph-education',
    criteria: ['active-ph-ink', 'education-visible-forward-and-reverse'],
    check: ({ samples }) => {
      const failures = [];
      for (const sample of samples) {
        if (!anyActiveInk(sample, ['lab-education'], ['entryInk', 'exitInk', 'paperWash'])) {
          failures.push(`${evidenceRef(sample)} lacks active PH/Education entry or exit ink.`);
        }
      }
      for (const mode of ['same-page-forward', 'same-page-reverse']) {
        const visible = samples.some((sample) => sample.captureMode === mode && (
          copyVisible(sample, 'education', 0.35) || receiverOpacity(sample, 'lab-education') >= 0.35
        ));
        if (!visible) failures.push(`${mode} evidence does not show Education content or receiver visibility.`);
      }
      return failures;
    }
  });
}

function gatePhEducationDivider(report) {
  return resultFor({
    report,
    issue: 13,
    gate: 'ph-education-divider',
    criteria: ['single-horizontal-line-owner'],
    check: ({ samples }) => lineOwnerFailures(samples, 'PH/Education')
  });
}

function gateCraneContact(report) {
  return resultFor({
    report,
    issue: 14,
    gate: 'crane-contact',
    criteria: ['active-crane-ink', 'contact-before-crane-exit'],
    check: ({ samples }) => {
      const failures = [];
      for (const sample of samples) {
        if (!anyActiveInk(sample, ['philosophy-contact'], ['entryInk', 'exitInk', 'paperWash'])) {
          failures.push(`${evidenceRef(sample)} lacks active Crane entry or exit ink.`);
        }
      }
      const orderingOk = samples.some((sample) => (
        receiverOpacity(sample, 'philosophy-contact') >= 0.45
        && sceneOpacity(sample, 'philosophy-contact') >= 0.3
      ));
      if (!orderingOk) failures.push('No sample shows Contact receiver opacity >= 0.45 before Crane scene opacity drops below 0.30.');
      return failures;
    }
  });
}

function gateEndpoint(report) {
  return resultFor({
    report,
    issue: 15,
    gate: 'endpoint',
    criteria: ['approved-endpoint-mode', 'snap-target-tolerance', 'footer-visible-ratio-window'],
    check: ({ samples }) => {
      const failures = [];
      for (const sample of samples) {
        const endpoint = sample.endpoint || {};
        const spec = endpoint.chosenEndpointSpec || {};
        const mode = spec.mode || 'undecided';
        const tolerancePx = number(spec.tolerancePx, NaN);
        const snapDeltaPx = number(endpoint.snapDeltaPx, NaN);
        if (mode === 'undecided') failures.push(`${evidenceRef(sample)} endpoint mode is undecided.`);
        if (!spec.snapTarget) failures.push(`${evidenceRef(sample)} endpoint snapTarget is empty.`);
        if (!spec.approvalSource) failures.push(`${evidenceRef(sample)} endpoint approvalSource is missing.`);
        if (!Number.isFinite(tolerancePx)) failures.push(`${evidenceRef(sample)} endpoint tolerancePx is missing.`);
        if (!Number.isFinite(snapDeltaPx)) {
          failures.push(`${evidenceRef(sample)} endpoint snapDeltaPx is missing.`);
        } else if (Number.isFinite(tolerancePx) && snapDeltaPx > tolerancePx) {
          failures.push(`${evidenceRef(sample)} endpoint snapDeltaPx ${snapDeltaPx}px exceeds tolerance ${tolerancePx}px.`);
        }
        const ratio = number(endpoint.footerVisibleRatio, NaN);
        const min = number(spec.footerVisibleRatioMin, NaN);
        const max = number(spec.footerVisibleRatioMax, NaN);
        if (!Number.isFinite(ratio) || !Number.isFinite(min) || !Number.isFinite(max)) {
          failures.push(`${evidenceRef(sample)} endpoint footer ratio window is incomplete.`);
        } else if (ratio < min || ratio > max) {
          failures.push(`${evidenceRef(sample)} footer visible ratio ${ratio} is outside ${min}-${max}.`);
        }
      }
      return failures;
    }
  });
}

function applyResults(report, issues) {
  const issueById = new Map(issues.map((issue) => [issue.issue, issue]));
  report.gateResults = {
    status: issues.every((issue) => issue.status === 'passed') ? 'passed' : 'failed',
    requiredCaptureModes: REQUIRED_DESKTOP_MODES,
    passed: issues.filter((issue) => issue.status === 'passed').length,
    failed: issues.filter((issue) => issue.status === 'failed').length,
    issues
  };

  report.crosswalkEvidence = (report.crosswalkEvidence || []).map((row) => {
    const issue = issueById.get(row.issue);
    if (!issue) return row;
    return {
      ...row,
      status: issue.status,
      gate: issue.gate,
      evidenceRefs: issue.evidenceRefs,
      missingEvidenceRefs: issue.missingEvidenceRefs,
      failures: issue.failures
    };
  });

  return report;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(options.input, 'utf8'));
  const issues = GATE_ORDER.map((gate) => gate(report));
  const presentIssues = new Set((report.crosswalkEvidence || []).map((row) => row.issue));
  for (const expectedIssue of EXPECTED_USER_ISSUES) {
    if (presentIssues.has(expectedIssue)) continue;
    const existing = issues.find((issue) => issue.issue === expectedIssue);
    if (existing) {
      existing.status = 'failed';
      existing.failures.push(`Issue #${expectedIssue} is missing from crosswalkEvidence.`);
      continue;
    }
    issues.push({
      issue: expectedIssue,
      status: 'failed',
      gate: 'missing-crosswalk-row',
      criteria: ['crosswalk-completeness'],
      evidenceRefs: [],
      missingEvidenceRefs: [],
      failures: [`Issue #${expectedIssue} is missing from crosswalkEvidence.`]
    });
  }
  issues.sort((a, b) => a.issue - b.issue);
  applyResults(report, issues);

  if (options.write) {
    await writeFile(options.input, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const summary = report.gateResults;
  console.log(`Homepage transition gates: ${summary.status} (${summary.passed} passed, ${summary.failed} failed)`);
  for (const issue of summary.issues) {
    const marker = issue.status === 'passed' ? 'PASS' : 'FAIL';
    console.log(`${marker} #${issue.issue} ${issue.gate}`);
    for (const failure of issue.failures.slice(0, 5)) {
      console.log(`  - ${failure}`);
    }
    if (issue.failures.length > 5) {
      console.log(`  - ... ${issue.failures.length - 5} more`);
    }
  }

  const strictComplete = summary.status === 'passed'
    && summary.passed === EXPECTED_USER_ISSUES.length
    && summary.failed === 0
    && EXPECTED_USER_ISSUES.every((issue) => summary.issues.some((result) => result.issue === issue && result.status === 'passed'));

  if (options.strict && !strictComplete) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
