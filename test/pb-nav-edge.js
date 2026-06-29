(function () {
  'use strict';

  var nav = document.querySelector('.site-nav');
  if (!nav) { console.warn('[PB Nav] .site-nav not found'); return; }

  var supports = typeof CSS !== 'undefined' && CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
  if (!supports) {
    console.warn('[PB Nav] backdrop-filter not supported');
    return;
  }

  var edge = document.createElement('div');
  edge.className = 'pb-nav-edge';
  edge.setAttribute('aria-hidden', 'true');

  for (var i = 0; i < 7; i++) {
    var layer = document.createElement('div');
    layer.className = 'pb-layer';
    edge.appendChild(layer);
  }

  nav.parentNode.insertBefore(edge, nav.nextSibling);
  console.log('[PB Nav] Progressive blur edge injected');
})();