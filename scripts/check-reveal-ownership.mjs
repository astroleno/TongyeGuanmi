import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const revealPath = path.join(rootDir, 'js/ui/reveal.js');
const source = await readFile(revealPath, 'utf8');

function fail(message) {
  console.error(`Reveal ownership contract failed: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function exportedFunctionBody(name) {
  const start = source.indexOf(`export function ${name}`);
  if (start === -1) return '';
  const nextExport = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

assert(source.includes('export function isSceneRuntimeOwned'), 'isSceneRuntimeOwned must be exported');
assert(source.includes('export function getRevealItems'), 'getRevealItems must be exported');
assert(
  /export function isSceneRuntimeOwned[\s\S]*data-scene-owner="scene-runtime"/.test(source),
  'isSceneRuntimeOwned must detect SceneRuntime-owned DOM'
);
assert(
  /export function getRevealItems[\s\S]*isSceneRuntimeOwned/.test(source),
  'getRevealItems must filter SceneRuntime-owned reveal nodes'
);

[
  'setRevealPresentedWithin',
  'suppressRevealOnceWithin',
  'holdRevealWithin',
  'releaseRevealWithin'
].forEach((name) => {
  assert(exportedFunctionBody(name).includes('getRevealItems(root)'), `${name} must use getRevealItems(root)`);
});

assert(exportedFunctionBody('initVanillaReveal').includes('getRevealItems(document)'), 'initVanillaReveal must use getRevealItems(document)');
assert(exportedFunctionBody('initGsapTextAndUI').includes('getRevealItems(document)'), 'initGsapTextAndUI must use getRevealItems(document)');
assert(!source.includes("document.querySelectorAll('.reveal')"), 'document.querySelectorAll(".reveal") bypasses reveal ownership');
assert(!source.includes('document.querySelectorAll(".reveal")'), 'document.querySelectorAll(".reveal") bypasses reveal ownership');
assert(!source.includes("gsap.set('.reveal'"), 'gsap.set(".reveal") bypasses reveal ownership');
assert(!source.includes('gsap.set(".reveal"'), 'gsap.set(".reveal") bypasses reveal ownership');
assert(!source.includes("gsap.utils.toArray('.reveal'"), 'gsap.utils.toArray(".reveal") bypasses reveal ownership');
assert(!source.includes('gsap.utils.toArray(".reveal"'), 'gsap.utils.toArray(".reveal") bypasses reveal ownership');

if (!process.exitCode) {
  console.log('Reveal ownership contract passed.');
}
