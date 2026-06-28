import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chapterTransitions,
  contentSections,
  handoffs,
  homepageEndpointSpec,
  sceneTransitionContracts,
  sectionEntryPolicies
} from '../src/section-manifest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(rootDir, 'src');
const includePattern = /\{\{>\s*([^}]+?)\s*\}\}/g;

function resolveSourcePath(partialPath) {
  if (path.isAbsolute(partialPath) || partialPath.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing unsafe include path: ${partialPath}`);
  }
  return path.join(srcDir, partialPath);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAttribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`));
  return match?.[1] ?? null;
}

function hasClass(attrs, className) {
  return (getAttribute(attrs, 'class') || '').split(/\s+/).includes(className);
}

function setAttribute(attrs, name, value) {
  const escapedValue = escapeHtml(value);
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`);
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, ` ${name}="${escapedValue}"`);
  }
  return `${attrs} ${name}="${escapedValue}"`;
}

function formatPhaseSpec(phases = []) {
  return phases
    .map((phase) => `${phase.id}:${phase.start}-${phase.end}${phase.required ? ':required' : ''}`)
    .join('|');
}

function formatWindowSpec(windows = []) {
  return windows
    .map((windowSpec) => {
      const owner = windowSpec.bridge
        ? `${windowSpec.bridge}:${windowSpec.topOwner || windowSpec.primaryOwner || ''}>${windowSpec.bottomOwner || windowSpec.receiverOwner || ''}:${windowSpec.commitOwner || ''}`
        : `owner:${windowSpec.owner || ''}`;
      return `${windowSpec.name}:${windowSpec.from}-${windowSpec.to}:${owner}:p${windowSpec.priority || 0}`;
    })
    .join('|');
}

function getHandoffForTransition(transitionId) {
  return handoffs.find((handoff) => handoff.transitionId === transitionId) || null;
}

function injectSectionAttributes(html, section, index) {
  const sectionOpenPattern = /<section\b[^>]*>/g;
  let didInject = false;

  const nextHtml = html.replace(sectionOpenPattern, (tag) => {
    if (didInject || !tag.includes(section.match)) return tag;

    let attrs = tag.slice('<section'.length, -1);
    attrs = setAttribute(attrs, 'id', section.id);
    attrs = setAttribute(attrs, 'data-section-id', section.id);
    attrs = setAttribute(attrs, 'data-section-index', index);
    attrs = setAttribute(attrs, 'data-section-theme', section.theme);
    attrs = setAttribute(attrs, 'data-section-nav-bg', section.navBg);
    attrs = setAttribute(attrs, 'data-section-layout', section.layout);
    const entryPolicy = sectionEntryPolicies[section.id];
    if (entryPolicy) {
      attrs = setAttribute(attrs, 'data-entry-direct', entryPolicy.directVisit);
      attrs = setAttribute(attrs, 'data-entry-after-handoff', entryPolicy.afterHandoff);
    }
    didInject = true;
    return `<section${attrs}>`;
  });

  if (!didInject) {
    throw new Error(`Unable to inject section metadata for ${section.id} using match ${section.match}`);
  }

  return nextHtml;
}

function injectTransitionAttributes(html, transition) {
  const divOpenPattern = /<div\b[^>]*>/g;
  let didInject = false;

  const nextHtml = html.replace(divOpenPattern, (tag) => {
    if (didInject) return tag;

    let attrs = tag.slice('<div'.length, -1);
    if (!hasClass(attrs, 'chapter-transition')) return tag;
    if (getAttribute(attrs, 'data-transition') !== transition.id) return tag;

    attrs = setAttribute(attrs, 'data-transition', transition.id);
    attrs = setAttribute(attrs, 'data-transition-id', transition.id);
    attrs = setAttribute(attrs, 'data-transition-from', transition.from);
    attrs = setAttribute(attrs, 'data-transition-to', transition.to);
    attrs = setAttribute(attrs, 'data-transition-module', transition.module);
    attrs = setAttribute(attrs, 'data-transition-variant', transition.variant);
    if (transition.drive) attrs = setAttribute(attrs, 'data-transition-drive', transition.drive);
    attrs = setAttribute(attrs, 'data-transition-runtime-mode', transition.runtimeMode || 'legacy-snap');
    if (transition.progressStartAnchor) attrs = setAttribute(attrs, 'data-transition-progress-start-anchor', transition.progressStartAnchor);
    if (transition.progressEndAnchor) attrs = setAttribute(attrs, 'data-transition-progress-end-anchor', transition.progressEndAnchor);
    if (Number.isFinite(transition.startOffsetVh)) attrs = setAttribute(attrs, 'data-transition-start-offset-vh', transition.startOffsetVh);
    if (Number.isFinite(transition.endOffsetVh)) attrs = setAttribute(attrs, 'data-transition-end-offset-vh', transition.endOffsetVh);
    if (transition.windows?.length) attrs = setAttribute(attrs, 'data-transition-window-spec', formatWindowSpec(transition.windows));
    if (transition.handoffTarget) attrs = setAttribute(attrs, 'data-transition-handoff-target', transition.handoffTarget);
    if (transition.handoffPhase) attrs = setAttribute(attrs, 'data-transition-handoff-phase', transition.handoffPhase);
    if (transition.preserveEntry) attrs = setAttribute(attrs, 'data-transition-preserve-entry', 'true');
    if (transition.contract) {
      attrs = setAttribute(attrs, 'data-transition-contract-id', transition.contract.id);
      attrs = setAttribute(attrs, 'data-transition-mode', transition.contract.mode);
      attrs = setAttribute(attrs, 'data-transition-bridge-type', transition.contract.bridgeType);
      attrs = setAttribute(attrs, 'data-transition-phase-spec', formatPhaseSpec(transition.contract.phases));
      if (transition.contract.snapPolicy?.target) {
        attrs = setAttribute(attrs, 'data-transition-snap-target', transition.contract.snapPolicy.target);
      }
      if (Number.isFinite(transition.contract.snapPolicy?.tolerancePx)) {
        attrs = setAttribute(attrs, 'data-transition-snap-tolerance-px', transition.contract.snapPolicy.tolerancePx);
      }
      if (transition.contract.handoff?.receiver) {
        attrs = setAttribute(attrs, 'data-transition-receiver', transition.contract.handoff.receiver);
      }
    }
    const handoff = getHandoffForTransition(transition.id);
    if (handoff) {
      attrs = setAttribute(attrs, 'data-handoff-id', handoff.id);
      attrs = setAttribute(attrs, 'data-handoff-owner', handoff.owner);
      attrs = setAttribute(attrs, 'data-target-entry-policy', handoff.targetEntry.policy);
      attrs = setAttribute(attrs, 'data-target-entry-suppress-once', String(handoff.targetEntry.suppressOnceAfterHandoff));
      attrs = setAttribute(attrs, 'data-handoff-scroll-to', handoff.afterComplete.scrollTo);
      attrs = setAttribute(attrs, 'data-handoff-reduced-motion', handoff.reducedMotion.policy);
      if (handoff.transition?.targetSelector) {
        attrs = setAttribute(attrs, 'data-handoff-target-selector', handoff.transition.targetSelector);
      }
      if (handoff.transition?.ghostScenes?.length) {
        attrs = setAttribute(attrs, 'data-transition-ghost-scenes', handoff.transition.ghostScenes.join(','));
      }
    }

    didInject = true;
    return `<div${attrs}>`;
  });

  if (!didInject) {
    throw new Error(`Unable to find transition ${transition.id}`);
  }

  return nextHtml;
}

function injectSceneTransitionContractAttributes(html, contract) {
  const divOpenPattern = /<div\b[^>]*>/g;
  let didInject = false;

  const nextHtml = html.replace(divOpenPattern, (tag) => {
    if (didInject) return tag;

    let attrs = tag.slice('<div'.length, -1);
    if (!hasClass(attrs, 'scene-transition')) return tag;
    if (getAttribute(attrs, 'data-transition-id') !== contract.id) return tag;

    attrs = setAttribute(attrs, 'data-transition-contract-id', contract.id);
    attrs = setAttribute(attrs, 'data-transition-mode', contract.mode);
    attrs = setAttribute(attrs, 'data-transition-runtime-mode', contract.runtimeMode || contract.mode || 'stage-playback');
    attrs = setAttribute(attrs, 'data-transition-bridge-type', contract.bridgeType);
    attrs = setAttribute(attrs, 'data-transition-phase-spec', formatPhaseSpec(contract.phases));
    if (contract.progressStartAnchor) attrs = setAttribute(attrs, 'data-transition-progress-start-anchor', contract.progressStartAnchor);
    if (contract.progressEndAnchor) attrs = setAttribute(attrs, 'data-transition-progress-end-anchor', contract.progressEndAnchor);
    if (Number.isFinite(contract.startOffsetVh)) attrs = setAttribute(attrs, 'data-transition-start-offset-vh', contract.startOffsetVh);
    if (Number.isFinite(contract.endOffsetVh)) attrs = setAttribute(attrs, 'data-transition-end-offset-vh', contract.endOffsetVh);
    if (contract.windows?.length) attrs = setAttribute(attrs, 'data-transition-window-spec', formatWindowSpec(contract.windows));
    if (contract.handoff?.receiver) {
      attrs = setAttribute(attrs, 'data-transition-receiver', contract.handoff.receiver);
    }
    didInject = true;
    return `<div${attrs}>`;
  });

  if (!didInject) {
    throw new Error(`Unable to find scene transition contract target ${contract.id}`);
  }

  return nextHtml;
}

function injectEndpointSpecAttributes(html) {
  const htmlOpenPattern = /<html\b[^>]*>/;
  if (!htmlOpenPattern.test(html)) {
    throw new Error('Unable to inject homepage endpoint spec: missing <html> tag');
  }

  return html.replace(htmlOpenPattern, (tag) => {
    let attrs = tag.slice('<html'.length, -1);
    attrs = setAttribute(attrs, 'data-homepage-endpoint-mode', homepageEndpointSpec.mode);
    attrs = setAttribute(attrs, 'data-homepage-endpoint-snap-target', homepageEndpointSpec.snapTarget);
    attrs = setAttribute(attrs, 'data-homepage-endpoint-footer-min', homepageEndpointSpec.footerVisibleRatioMin ?? '');
    attrs = setAttribute(attrs, 'data-homepage-endpoint-footer-max', homepageEndpointSpec.footerVisibleRatioMax ?? '');
    attrs = setAttribute(attrs, 'data-homepage-endpoint-tolerance-px', homepageEndpointSpec.tolerancePx ?? '');
    attrs = setAttribute(attrs, 'data-homepage-endpoint-approval-source', homepageEndpointSpec.approvalSource);
    return `<html${attrs}>`;
  });
}

function injectContractAttributes(html) {
  let nextHtml = html;

  contentSections.forEach((section, index) => {
    nextHtml = injectSectionAttributes(nextHtml, section, index);
  });

  chapterTransitions.forEach((transition) => {
    nextHtml = injectTransitionAttributes(nextHtml, transition);
  });

  sceneTransitionContracts.forEach((contract) => {
    nextHtml = injectSceneTransitionContractAttributes(nextHtml, contract);
  });

  nextHtml = injectEndpointSpecAttributes(nextHtml);

  return nextHtml;
}

async function renderFile(relativePath, stack = []) {
  if (stack.includes(relativePath)) {
    throw new Error(`Circular include detected: ${[...stack, relativePath].join(' -> ')}`);
  }

  const filePath = resolveSourcePath(relativePath);
  let source = await readFile(filePath, 'utf8');
  const includes = [...source.matchAll(includePattern)];

  for (const match of includes) {
    const rendered = await renderFile(match[1], [...stack, relativePath]);
    source = source.replace(match[0], rendered.trimEnd());
  }

  return source;
}

const html = injectContractAttributes(await renderFile('index.template.html'));
await writeFile(path.join(rootDir, 'index.html'), `${html.trimEnd()}\n`);
console.log('Built index.html from src/index.template.html');
