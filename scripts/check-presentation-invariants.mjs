import assert from 'node:assert/strict';
import { createLayerOwnershipRegistry, LayerOwnershipConflictError } from '../js/scenes/runtime/layer-ownership.js';
import { createPlayerRuntimePort, createPresentationController } from '../js/scenes/runtime/presentation.js';

{
  const presentation = createPresentationController({ initialSceneId: 'hero' });
  const committed = presentation.present('method-top', {
    copyState: { sceneId: 'method-top', state: 'final' },
    navState: { activeSceneId: 'method-top' },
    hash: '#method',
    focusTarget: 'method-heading',
    posterSceneId: 'method-top',
    ariaState: { current: 'method-top' }
  });

  assert.equal(committed.currentSceneId, 'method-top');
  assert.deepEqual(committed.copyState, { sceneId: 'method-top', state: 'final' });
  assert.deepEqual(committed.navState, { activeSceneId: 'method-top' });
  assert.equal(committed.hash, '#method');
  assert.equal(committed.focusTarget, 'method-heading');
  assert.equal(committed.posterSceneId, 'method-top');
  assert.deepEqual(committed.ariaState, { current: 'method-top' });

  presentation.presentEarlyCopy({ targetScene: 'services' });
  assert.equal(
    presentation.getState().currentSceneId,
    'method-top',
    'presentEarlyCopy must not commit currentScene'
  );
  assert.equal(presentation.getState().earlyCopySceneId, 'services');
}

{
  const playerPort = createPlayerRuntimePort();
  assert.deepEqual(Object.keys(playerPort).sort(), ['claimLayer', 'reportError', 'reportProgress', 'reportReady']);
  assert.equal(playerPort.present, undefined);
  assert.equal(playerPort.setHash, undefined);
  assert.equal(playerPort.setNav, undefined);
  assert.equal(playerPort.setAria, undefined);
}

{
  const recovered = [];
  const ownership = createLayerOwnershipRegistry({
    mode: 'development',
    recovery: { recover: (details) => recovered.push(details.recoveryReason) }
  });
  ownership.claim({ layer: 'copy', owner: 'Presentation', token: 'method-top' });
  assert.throws(
    () => ownership.claim({ layer: 'copy', owner: 'SegmentPlayer', token: 'aod-play' }),
    LayerOwnershipConflictError,
    'player must not be able to take copy layer from Presentation'
  );
  assert.deepEqual(recovered, ['layer-owner-conflict']);
}

console.log('Presentation invariant checks passed.');
