import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aodPlayerTimingContract } from '../js/scenes/runtime/players/aod-player.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(rootDir, 'js/scenes/runtime/players/aod-player.js'), 'utf8');
const runtimeSource = readFileSync(path.join(rootDir, 'js/scenes/runtime/SceneRuntime.js'), 'utf8');
const stateMachine = readFileSync(path.join(rootDir, 'js/scenes/runtime/state-machine.js'), 'utf8');

assert.equal(aodPlayerTimingContract.posterGate, true, 'AOD player must declare a poster/first-frame gate');
assert.equal(aodPlayerTimingContract.autoplayAfterIntent, true, 'AOD player must autoplay only after the route arms aod-play');
assert.equal(aodPlayerTimingContract.earlyCopyAt, 0.8, 'AOD early copy must be wired at 80%');
assert.ok(aodPlayerTimingContract.readyTimeoutMs > 0, 'AOD player must declare a ready timeout');
assert.ok(aodPlayerTimingContract.endedGraceMs > 0, 'AOD player must declare an ended grace window');

assert(source.includes('poster="assets/aod-paper-bg.png"'), 'AOD media must include a poster');
assert(source.includes('waitForAodTransitionMetadata(section, { timeoutMs: readyTimeoutMs })'), 'AOD player must wait for metadata with a timeout');
assert(source.includes('function prepare()'), 'AOD player must expose a poster/first-frame prepare gate');
assert(source.includes('return { prepare, play, stop, destroy: stop }'), 'AOD player must expose prepare() to SceneRuntime');
assert(runtimeSource.includes("if (sceneId === 'aod-animation')"), 'SceneRuntime must prepare the AOD poster when aod-animation is presented');
assert(runtimeSource.includes('this.aodPlayer?.prepare?.()'), 'AOD poster must be prepared before the second 10vh aod-play intent');
assert(source.includes("video.readyState < 1"), 'AOD player must fail if first-frame readiness is unresolved');
assert(source.includes('await playVideo(video)'), 'AOD player must autoplay media after the route intent');
assert(source.includes('video.play?.()'), 'AOD player must call video.play()');
assert(source.includes('function presentRealTargetCopy(targetScene)'), 'AOD player must present early copy through a real target DOM helper');
assert(source.includes('presentation?.presentEarlyCopy?.({ targetScene })'), 'AOD player must present early copy through Presentation');
assert(source.includes('window.scrollTo({ top, behavior: \'auto\' })'), 'AOD early copy must land on the real method-top DOM');
assert(source.includes('progress >= (segment.earlyCopyAt ?? 0.8)'), 'AOD player must trigger early copy at the segment threshold');
assert(source.includes('await wait(endedGraceMs)'), 'AOD player must honor ended grace');
assert(source.includes('throw new Error'), 'AOD missing media / play failures must reject to recovery');
assert(stateMachine.includes("recoveryReason: 'PLAYING_ERROR'"), 'play rejection must route through state-machine recovery');
assert(stateMachine.includes("recoveryReason: 'PLAYER_TIMEOUT'"), 'ready/player timeout must route through state-machine recovery');

console.log('AOD media poster gate checks passed.');
