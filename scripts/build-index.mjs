import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chapterTransitions,
  contentSections,
  handoffs,
  sectionEntryPolicies,
  timelineJoins,
  timelineScenes
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

function matchesSimpleSelector(tagName, attrs, selector) {
  if (selector.startsWith('.')) {
    return hasClass(attrs, selector.slice(1));
  }

  if (selector.startsWith('#')) {
    return getAttribute(attrs, 'id') === selector.slice(1);
  }

  const attrMatch = selector.match(/^\[([A-Za-z0-9:_-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, name, value] = attrMatch;
    return value === undefined ? getAttribute(attrs, name) !== null : getAttribute(attrs, name) === value;
  }

  return tagName.toLowerCase() === selector.toLowerCase();
}

function setAttribute(attrs, name, value) {
  const escapedValue = escapeHtml(value);
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`);
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, ` ${name}="${escapedValue}"`);
  }
  return `${attrs} ${name}="${escapedValue}"`;
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
    if (transition.handoffTarget) attrs = setAttribute(attrs, 'data-transition-handoff-target', transition.handoffTarget);
    if (transition.handoffPhase) attrs = setAttribute(attrs, 'data-transition-handoff-phase', transition.handoffPhase);
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

function injectFirstTagBySelector(html, selector, applyAttributes, label) {
  const openPattern = /<([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/g;
  let didInject = false;

  const nextHtml = html.replace(openPattern, (tag, tagName) => {
    if (didInject) return tag;

    let attrs = tag.slice(`<${tagName}`.length, -1);
    if (!matchesSimpleSelector(tagName, attrs, selector)) return tag;

    attrs = applyAttributes(attrs);
    didInject = true;
    return `<${tagName}${attrs}>`;
  });

  if (!didInject) {
    throw new Error(`Unable to inject timeline metadata for ${label} using selector ${selector}`);
  }

  return nextHtml;
}

function injectTimelineAttributes(html) {
  let nextHtml = html;

  for (const scene of timelineScenes) {
    if (scene.sceneTarget && scene.sectionSelector) {
      nextHtml = injectFirstTagBySelector(
        nextHtml,
        scene.sectionSelector,
        (attrs) => setAttribute(attrs, 'data-scene-target', scene.sceneTarget),
        `${scene.id} section`
      );
    }

    for (const copy of scene.copySelectors || []) {
      nextHtml = injectFirstTagBySelector(
        nextHtml,
        copy.selector,
        (attrs) => {
          let nextAttrs = setAttribute(attrs, 'data-scene-copy', scene.id);
          if (scene.sceneTarget) {
            nextAttrs = setAttribute(nextAttrs, 'data-scene-target', scene.sceneTarget);
          }
          if (copy.entryOwner) {
            nextAttrs = setAttribute(nextAttrs, 'data-entry-owner', copy.entryOwner);
            nextAttrs = setAttribute(nextAttrs, 'data-entry-state', 'pending');
          }
          return nextAttrs;
        },
        `${scene.id} copy`
      );
    }
  }

  return nextHtml;
}

function injectContractAttributes(html) {
  let nextHtml = html;

  contentSections.forEach((section, index) => {
    nextHtml = injectSectionAttributes(nextHtml, section, index);
  });

  chapterTransitions.forEach((transition) => {
    nextHtml = injectTransitionAttributes(nextHtml, transition);
  });

  nextHtml = injectTimelineAttributes(nextHtml);

  return nextHtml;
}

function buildGeneratedTimelineManifest() {
  return [
    '// Generated by scripts/build-index.mjs from src/section-manifest.mjs. Do not edit.',
    '',
    `export const timelineScenes = ${JSON.stringify(timelineScenes, null, 2)};`,
    '',
    `export const timelineJoins = ${JSON.stringify(timelineJoins, null, 2)};`,
    ''
  ].join('\n');
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
await writeFile(
  path.join(rootDir, 'js/transitions/homepage/scene-timeline-manifest.js'),
  buildGeneratedTimelineManifest()
);
console.log('Built index.html and homepage scene timeline manifest from src/index.template.html');
