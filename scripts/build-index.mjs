import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homepageAliases } from '../src/homepage/homepage.aliases.mjs';
import { figure2InternalSteps, homepageScenes } from '../src/homepage/homepage.scenes.mjs';
import { chapterTransitions, contentSections, handoffs, sectionEntryPolicies } from '../src/section-manifest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(rootDir, 'src');
const includePattern = /\{\{>\s*([^}]+?)\s*\}\}/g;
const sceneRuntimeMode = process.argv.includes('--scene-runtime');
const sceneById = new Map(homepageScenes.map((scene) => [scene.id, scene]));

function getCliValue(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

const outputPath = getCliValue('--out') || (sceneRuntimeMode ? 'index-scene-runtime.html' : 'index.html');
const resolvedOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(rootDir, outputPath);

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

function removeAttribute(attrs, name) {
  return attrs.replace(new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`, 'g'), '');
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

function injectContractAttributes(html) {
  let nextHtml = html;

  contentSections.forEach((section, index) => {
    nextHtml = injectSectionAttributes(nextHtml, section, index);
  });

  chapterTransitions.forEach((transition) => {
    nextHtml = injectTransitionAttributes(nextHtml, transition);
  });

  return nextHtml;
}

function sceneHashValue(sceneId) {
  const hashes = Object.values(homepageAliases)
    .filter((alias) => alias.mapsToScene === sceneId)
    .map((alias) => alias.legacyHash);
  return hashes.join(',');
}

function sceneAttributes(sceneId, extra = {}) {
  const scene = sceneById.get(sceneId);
  if (!scene) throw new Error(`Unknown SceneRuntime scene: ${sceneId}`);

  const hashes = sceneHashValue(sceneId);
  return {
    'data-scene-id': sceneId,
    'data-scene-kind': scene.kind,
    'data-scene-owner': 'scene-runtime',
    ...(hashes ? { 'data-scene-hash': hashes } : {}),
    ...extra
  };
}

function setAttributes(attrs, nextAttributes) {
  let nextAttrs = attrs;
  Object.entries(nextAttributes).forEach(([name, value]) => {
    if (value === null || value === undefined || value === false) return;
    nextAttrs = setAttribute(nextAttrs, name, value);
  });
  return nextAttrs;
}

function setAttributesOnFirstTag(html, tagName, predicate, attributes, label) {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'g');
  let didUpdate = false;

  const nextHtml = html.replace(tagPattern, (tag) => {
    if (didUpdate || !predicate(tag)) return tag;
    const attrs = tag.slice(tagName.length + 1, -1);
    didUpdate = true;
    return `<${tagName}${setAttributes(attrs, attributes)}>`;
  });

  if (!didUpdate) throw new Error(`Unable to mark SceneRuntime host for ${label}`);
  return nextHtml;
}

function markSectionScene(html, predicate, sceneId, extra = {}) {
  return setAttributesOnFirstTag(html, 'section', predicate, sceneAttributes(sceneId, extra), sceneId);
}

function markDivScene(html, predicate, sceneId, extra = {}) {
  return setAttributesOnFirstTag(html, 'div', predicate, sceneAttributes(sceneId, extra), sceneId);
}

function sceneShell(sceneId) {
  const scene = sceneById.get(sceneId);
  if (!scene) throw new Error(`Unknown SceneRuntime shell: ${sceneId}`);

  const attrs = setAttributes('', sceneAttributes(sceneId, {
    class: `scene-runtime-shell scene-runtime-shell--${scene.kind}`,
    'data-scene-runtime-shell': 'static',
    'aria-hidden': 'true'
  }));
  return `<section${attrs}></section>`;
}

function insertAfterFirst(html, pattern, insertion, label) {
  let didInsert = false;
  const nextHtml = html.replace(pattern, (match) => {
    if (didInsert) return match;
    didInsert = true;
    return `${match}\n      ${insertion}`;
  });

  if (!didInsert) throw new Error(`Unable to insert SceneRuntime shell after ${label}`);
  return nextHtml;
}

function stripLegacyHomepageAttributes(html) {
  return html
    .replace(/\s*<div\b[^>]*class="[^"]*\bchapter-transition\b[^"]*"[^>]*><\/div>\s*/g, '\n')
    .replace(/\s*<div\b[^>]*class="[^"]*\bscene-transition\b[^"]*"[^>]*><\/div>\s*/g, '\n')
    .replace(/<([a-z][a-z0-9-]*)\b[^>]*>/gi, (tag, tagName) => {
      let attrs = tag.slice(tagName.length + 1, -1);
      [
        'data-transition',
        'data-transition-id',
        'data-transition-from',
        'data-transition-to',
        'data-transition-module',
        'data-transition-variant',
        'data-transition-drive',
        'data-transition-handoff-target',
        'data-transition-handoff-phase',
        'data-transition-ghost-scenes',
        'data-transition-play-ms',
        'data-transition-stage-stops',
        'data-transition-stage-play-ms',
        'data-transition-stage-hold-vh',
        'data-transition-post-scroll-vh',
        'data-transition-source-only',
        'data-handoff-id',
        'data-handoff-owner',
        'data-handoff-scroll-to',
        'data-handoff-reduced-motion',
        'data-handoff-target-selector',
        'data-target-entry-policy',
        'data-target-entry-suppress-once',
        'data-scene-copy',
        'data-scene-target'
      ].forEach((name) => {
        attrs = removeAttribute(attrs, name);
      });
      return `<${tagName}${attrs}>`;
    });
}

function markMethodRefs(html) {
  return html
    .replaceAll('data-scene-id="method-field-law"', 'data-scene-ref-id="method-field-law"')
    .replaceAll('data-scene-id="method-cocreation"', 'data-scene-ref-id="method-cocreation"')
    .replaceAll('data-scene-id="method-tooling"', 'data-scene-ref-id="method-tooling"');
}

function injectFigure2CompoundSteps(html) {
  const steps = figure2InternalSteps
    .map((step) => `<div class="scene-runtime-compound-step" data-compound-step-id="${escapeHtml(step.id)}" aria-hidden="true"></div>`)
    .join('');

  const hostPattern = /(<div\b[^>]*data-scene-id="figure2-animation"[^>]*>)/;
  if (!hostPattern.test(html)) throw new Error('Unable to locate figure2-animation host for compound steps');

  return html.replace(
    hostPattern,
    `$1\n      <div class="scene-runtime-compound-steps" data-compound-parent-id="figure2-animation" aria-hidden="true">${steps}</div>`
  );
}

function buildSceneRuntimeShell(html) {
  let nextHtml = stripLegacyHomepageAttributes(markMethodRefs(html));

  nextHtml = markSectionScene(nextHtml, (tag) => getAttribute(tag, 'id') === 'home', 'hero');
  nextHtml = insertAfterFirst(nextHtml, /<section\b[^>]*data-scene-id="hero"[\s\S]*?<\/section>/, sceneShell('pattern'), 'hero');
  nextHtml = markSectionScene(nextHtml, (tag) => getAttribute(tag, 'id') === 'belief', 'star-map');
  nextHtml = insertAfterFirst(nextHtml, /<section\b[^>]*data-scene-id="star-map"[\s\S]*?<\/section>/, sceneShell('aod-animation'), 'star-map');

  nextHtml = markDivScene(nextHtml, (tag) => hasClass(tag.slice('<div'.length, -1), 'chapter-intro--method'), 'method-top');
  nextHtml = markDivScene(nextHtml, (tag) => hasClass(tag.slice('<div'.length, -1), 'method-flow'), 'method-bottom', {
    'data-scene-hash-secondary': '#method'
  });
  nextHtml = markDivScene(nextHtml, (tag) => hasClass(tag.slice('<div'.length, -1), 'homepage-scene--method-proof'), 'figure2-animation', {
    'data-content-ref-id': 'method-proof'
  });
  nextHtml = injectFigure2CompoundSteps(nextHtml);

  nextHtml = markSectionScene(nextHtml, (tag) => hasClass(tag.slice('<section'.length, -1), 'canvas-section--brand'), 'brand', {
    id: 'brand'
  });
  nextHtml = insertAfterFirst(nextHtml, /<section\b[^>]*data-scene-id="brand"[\s\S]*?<\/section>/, sceneShell('figure3-animation'), 'brand');
  nextHtml = markSectionScene(nextHtml, (tag) => getAttribute(tag, 'id') === 'services', 'services');
  nextHtml = insertAfterFirst(nextHtml, /<section\b[^>]*data-scene-id="services"[\s\S]*?<\/section>/, sceneShell('ttg-animation'), 'services');
  nextHtml = markSectionScene(nextHtml, (tag) => getAttribute(tag, 'id') === 'lab', 'lab');
  nextHtml = insertAfterFirst(nextHtml, /<section\b[^>]*data-scene-id="lab"[\s\S]*?<\/section>/, sceneShell('ph-animation'), 'lab');
  nextHtml = markSectionScene(nextHtml, (tag) => getAttribute(tag, 'id') === 'education', 'education');
  nextHtml = insertAfterFirst(nextHtml, /<section\b[^>]*data-scene-id="education"[\s\S]*?<\/section>/, sceneShell('crane-animation'), 'education');
  nextHtml = markSectionScene(nextHtml, (tag) => getAttribute(tag, 'id') === 'contact', 'contact');

  return nextHtml.replace('<main id="top">', '<main id="top" data-scene-runtime-artifact="true">');
}

async function renderFile(relativePath, stack = [], options = {}) {
  if (stack.includes(relativePath)) {
    throw new Error(`Circular include detected: ${[...stack, relativePath].join(' -> ')}`);
  }

  const filePath = resolveSourcePath(relativePath);
  let source = await readFile(filePath, 'utf8');
  const includes = [...source.matchAll(includePattern)];

  for (const match of includes) {
    if (options.sceneRuntime && match[1] === 'sections/philosophy.html') {
      source = source.replace(match[0], '');
      continue;
    }

    const rendered = await renderFile(match[1], [...stack, relativePath], options);
    source = source.replace(match[0], rendered.trimEnd());
  }

  return source;
}

const renderedHtml = await renderFile('index.template.html', [], { sceneRuntime: sceneRuntimeMode });
const html = sceneRuntimeMode ? buildSceneRuntimeShell(renderedHtml) : injectContractAttributes(renderedHtml);
await writeFile(resolvedOutputPath, `${html.trimEnd()}\n`);
console.log(`Built ${outputPath} from src/index.template.html`);
