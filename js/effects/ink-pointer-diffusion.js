let sharedPointerDiffusion = null;

const VERTEX_SOURCE = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

export function createPointerDiffusionOverlayStyle() {
  return [
    'position: fixed',
    'pointer-events: none',
    'display: block',
    'visibility: hidden',
    'opacity: 0',
    'z-index: 50',
    'transform: translateZ(0)',
    'will-change: left, top, width, height, opacity'
  ].join('; ');
}

// This deliberately keeps the transition's broad → wet → pore hierarchy, but gates it
// through a local glyph mask so the resting DOM text never needs to be redrawn or moved.
export function createPointerDiffusionFragmentSource() {
  return `
    precision highp float;

    varying vec2 vUv;

    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uStrength;
    uniform float uTime;
    uniform float uGestureSeed;
    uniform float uUseActiveGlyph;
    uniform sampler2D uGlyphMask;
    uniform vec3 uColor;

    float hash(vec2 p) {
      p += vec2(uGestureSeed * 0.173, uGestureSeed * 0.317);
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.37);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      mat2 rotate = mat2(0.80, 0.60, -0.60, 0.80);
      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p = rotate * p * 2.03 + 13.17;
        amplitude *= 0.5;
      }
      return value;
    }

    float sampleGlyph(vec2 uv) {
      return texture2D(uGlyphMask, clamp(uv, vec2(0.001), vec2(0.999))).a;
    }

    float sampleActiveGlyph(vec2 uv) {
      return texture2D(uGlyphMask, clamp(uv, vec2(0.001), vec2(0.999))).g;
    }

    float sampleAnchorGlyph(vec2 uv) {
      return mix(sampleGlyph(uv), sampleActiveGlyph(uv), uUseActiveGlyph);
    }

    void main() {
      vec2 uv = vUv;
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 aspectUv = vec2(uv.x * aspect, uv.y);
      vec2 pointerUv = vec2(uPointer.x * aspect, uPointer.y);
      vec2 fromPointer = aspectUv - pointerUv;
      float distanceFromPointer = length(fromPointer);
      float angle = atan(fromPointer.y, fromPointer.x);
      float strength = clamp(uStrength, 0.0, 1.0);

      vec2 warp = vec2(
        fbm(aspectUv * 2.8 + vec2(uTime * 0.028, -uTime * 0.021)),
        fbm(aspectUv * 2.8 + vec2(8.7, 2.9) - uTime * 0.024)
      ) - 0.5;
      float broad = fbm(aspectUv * 4.0 + warp * 1.25 + vec2(uTime * 0.026, -uTime * 0.018));
      float wet = fbm(aspectUv * 12.8 + warp * 2.05 + vec2(broad * 1.5, uTime * 0.048));
      float pore = fbm(aspectUv * 35.0 - warp * 3.1 + vec2(-uTime * 0.072, broad * 1.2));
      float lobe = sin(angle * 3.0 + wet * 7.2) * 0.018 + sin(angle * 5.0 - broad * 6.4) * 0.011;
      float radius = mix(0.110, 0.340, strength);
      float clusterRadius = mix(0.420, 0.860, strength);
      radius = mix(radius, clusterRadius, uUseActiveGlyph);
      float noisyRadius = radius + (broad - 0.5) * 0.044 + (wet - 0.5) * 0.028 + (pore - 0.5) * 0.010 + lobe;
      float inkField = 1.0 - smoothstep(noisyRadius * 0.58, noisyRadius * 1.14, distanceFromPointer);

      vec2 pixel = 1.0 / max(uResolution, vec2(1.0));
      float glyph = sampleGlyph(uv);
      float gridScale = max(4.0, uResolution.y * 0.050);
      vec2 currentCell = floor(aspectUv * gridScale);
      float dropletField = 0.0;
      float detachedFlecks = 0.0;
      float contactField = 0.0;

      // A seed searches onto real glyph alpha before it can launch a blot.
      // The body stays outside; only its narrow neck is allowed to overlap the sharp DOM glyph.
      for (int gridY = -1; gridY <= 1; gridY++) {
        for (int gridX = -1; gridX <= 1; gridX++) {
          vec2 cell = currentCell + vec2(float(gridX), float(gridY));
          float seed = hash(cell + vec2(11.7, 3.1));
          vec2 jitter = vec2(
            hash(cell + vec2(17.3, 5.1)),
            hash(cell + vec2(43.7, 9.8))
          );
          vec2 centerAspect = (cell + vec2(0.18) + jitter * 0.64) / gridScale;
          vec2 candidateUv = vec2(centerAspect.x / aspect, centerAspect.y);
          vec2 anchorUv = candidateUv;
          float spin = hash(cell + vec2(2.6, 11.9)) * 6.2831853;
          vec2 axis = vec2(cos(spin), sin(spin));
          float bodyRadius = mix(0.055, 0.135, hash(cell + vec2(23.4, 8.8))) * mix(0.62, 0.86, wet);
          float bodyStretch = mix(0.64, 1.28, hash(cell + vec2(7.4, 19.3)));
          float glyphAnchor = sampleAnchorGlyph(anchorUv);
          vec2 searchStep = vec2(pixel.x * 4.0, pixel.y * 4.0);
          vec2 searchUv = candidateUv + vec2(searchStep.x, 0.0);
          float searchedGlyph = sampleAnchorGlyph(searchUv);
          float searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv - vec2(searchStep.x, 0.0);
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv + vec2(0.0, searchStep.y);
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv - vec2(0.0, searchStep.y);
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv + searchStep;
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv + vec2(searchStep.x, -searchStep.y);
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv + vec2(-searchStep.x, searchStep.y);
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);
          searchUv = candidateUv - searchStep;
          searchedGlyph = sampleAnchorGlyph(searchUv);
          searchWins = step(glyphAnchor + 0.001, searchedGlyph);
          anchorUv = mix(anchorUv, searchUv, searchWins);
          glyphAnchor = max(glyphAnchor, searchedGlyph);

          vec2 anchorAspect = vec2(anchorUv.x * aspect, anchorUv.y);
          float anchorDistance = length(anchorAspect - pointerUv);
          float anchorWindow = 1.0 - smoothstep(noisyRadius * 0.54, noisyRadius * 1.12, anchorDistance);
          float anchorCore = smoothstep(0.34, 0.72, glyphAnchor);
          float anchored = anchorCore * anchorWindow * inkField;
          vec2 axisUv = vec2(axis.x / aspect, axis.y);
          float edgeProbe = bodyRadius * 0.72;
          float forwardGlyph = sampleAnchorGlyph(anchorUv + axisUv * edgeProbe);
          float backwardGlyph = sampleAnchorGlyph(anchorUv - axisUv * edgeProbe);
          float edgeExit = 1.0 - min(forwardGlyph, backwardGlyph);
          vec2 outward = mix(-axis, axis, step(forwardGlyph, backwardGlyph));
          vec2 outwardPerpendicular = vec2(-outward.y, outward.x);
          float edgeAnchored = anchored * smoothstep(0.18, 0.66, edgeExit) * step(0.58, seed);

          vec2 dropCenter = anchorAspect + outward * bodyRadius * mix(1.04, 1.30, hash(cell + vec2(31.1, 6.2)));
          vec2 fromDrop = aspectUv - dropCenter;
          vec2 bodyUv = vec2(
            dot(fromDrop, outward) / bodyRadius,
            dot(fromDrop, outwardPerpendicular) / (bodyRadius * bodyStretch)
          );
          float bodyAngle = atan(bodyUv.y, bodyUv.x);
          float bodyBoundary = 1.0
            + sin(bodyAngle * 3.0 + seed * 8.0) * 0.18
            + sin(bodyAngle * 5.0 - hash(cell + vec2(5.2, 11.9)) * 7.0) * 0.09
            + (pore - 0.5) * 0.16;
          float dropletBody = 1.0 - smoothstep(bodyBoundary * 0.78, bodyBoundary, length(bodyUv));

          vec2 neckCenter = anchorAspect + outward * bodyRadius * mix(0.36, 0.48, hash(cell + vec2(5.2, 11.9)));
          vec2 fromNeck = aspectUv - neckCenter;
          vec2 neckUv = vec2(
            dot(fromNeck, outward) / (bodyRadius * 0.96),
            dot(fromNeck, outwardPerpendicular) / (bodyRadius * 0.18)
          );
          float dropletNeck = 1.0 - smoothstep(0.72, 1.0, length(neckUv));

          vec2 tailCenter = dropCenter + outward * bodyRadius * mix(0.62, 1.02, hash(cell + vec2(13.6, 27.8)));
          vec2 fromTail = aspectUv - tailCenter;
          vec2 tailUv = vec2(
            dot(fromTail, outward) / (bodyRadius * 0.70),
            dot(fromTail, outwardPerpendicular) / (bodyRadius * bodyStretch * 0.46)
          );
          float dropletTail = 1.0 - smoothstep(0.62, 1.0, length(tailUv));
          dropletField = max(dropletField, max(dropletBody, dropletTail) * edgeAnchored);
          contactField = max(contactField, dropletNeck * edgeAnchored);

          vec2 fleckCenter = dropCenter + outward * bodyRadius * mix(1.54, 2.16, hash(cell + vec2(41.9, 14.2)));
          float fleckRadius = bodyRadius * mix(0.13, 0.27, hash(cell + vec2(29.6, 37.4)));
          float detachedFleck = 1.0 - smoothstep(0.44, 1.0, length((aspectUv - fleckCenter) / fleckRadius));
          detachedFlecks = max(detachedFlecks, detachedFleck * edgeAnchored * step(0.68, hash(cell + vec2(43.7, 9.8))));
        }
      }

      // The DOM glyph remains sharp. This canvas contains only the new wet matter around it.
      float outsideGlyph = 1.0 - smoothstep(0.015, 0.18, glyph);
      float blobInk = max(max(dropletField, detachedFlecks) * outsideGlyph, contactField);
      float opaqueInk = smoothstep(0.42, 0.78, blobInk) * smoothstep(0.04, 0.18, strength);

      gl_FragColor = vec4(uColor, clamp(opaqueInk, 0.0, 0.98));
    }
  `;
}

export function getInkPointerDiffusion() {
  if (sharedPointerDiffusion) return sharedPointerDiffusion;
  if (typeof document === 'undefined' || !document.body) return createUnavailableDiffusion();

  sharedPointerDiffusion = createInkPointerDiffusion();
  return sharedPointerDiffusion;
}

function createInkPointerDiffusion() {
  const canvas = document.createElement('canvas');
  canvas.className = 'ink-pointer-diffusion-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = createPointerDiffusionOverlayStyle();

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  const maskCanvas = document.createElement('canvas');
  const maskContext = maskCanvas.getContext('2d');
  if (!gl || !maskContext) return createUnavailableDiffusion();

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, createPointerDiffusionFragmentSource());
  if (!vertexShader || !fragmentShader) return createUnavailableDiffusion();

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return createUnavailableDiffusion();

  const position = gl.getAttribLocation(program, 'aPosition');
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    pointer: gl.getUniformLocation(program, 'uPointer'),
    strength: gl.getUniformLocation(program, 'uStrength'),
    time: gl.getUniformLocation(program, 'uTime'),
    gestureSeed: gl.getUniformLocation(program, 'uGestureSeed'),
    useActiveGlyph: gl.getUniformLocation(program, 'uUseActiveGlyph'),
    glyphMask: gl.getUniformLocation(program, 'uGlyphMask'),
    color: gl.getUniformLocation(program, 'uColor')
  };
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1
  ]), gl.STATIC_DRAW);

  const glyphTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glyphTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  document.body.append(canvas);

  let activeHost = null;
  let maskKey = '';
  let cssWidth = 0;
  let cssHeight = 0;
  let cssLeft = 0;
  let cssTop = 0;
  let pixelRatio = 1;

  const hide = (host) => {
    if (host && activeHost && activeHost !== host) return;
    if (!activeHost) return;
    activeHost = null;
    canvas.dataset.inkbleedDiffusionActive = 'false';
    canvas.style.visibility = 'hidden';
    canvas.style.opacity = '0';
  };

  const render = ({
    host,
    text,
    clientX,
    clientY,
    strength = 0,
    activeCharacterIndexes = [],
    gestureSeed = 0,
    freezePattern = false
  } = {}) => {
    const amount = clamp(Number(strength) || 0, 0, 1);
    if (!(host instanceof HTMLElement) || !host.isConnected || !text || amount <= .001) {
      hide(host);
      return;
    }

    const activeIndexes = [...new Set(activeCharacterIndexes.filter(Number.isInteger))].sort((a, b) => a - b);
    const geometry = updateGeometry(host, text, activeIndexes);
    if (!geometry) {
      hide(host);
      return;
    }

    activeHost = host;
    const pointerX = clamp((clientX - cssLeft) / cssWidth, 0, 1);
    const pointerY = clamp(1 - ((clientY - cssTop) / cssHeight), 0, 1);
    const color = readColor(geometry.style.color);
    canvas.style.visibility = 'visible';
    canvas.style.opacity = '1';
    canvas.dataset.inkbleedDiffusionActive = 'true';
    canvas.dataset.inkbleedDiffusionStrength = amount.toFixed(3);
    canvas.dataset.inkbleedDiffusionVariant = activeIndexes.length > 0 ? 'glyph-anchored' : 'local';

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glyphTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    gl.uniform1i(uniforms.glyphMask, 0);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointerX, pointerY);
    gl.uniform1f(uniforms.strength, amount);
    gl.uniform1f(uniforms.time, freezePattern ? Number(gestureSeed) * .001 : performance.now() * .001);
    gl.uniform1f(uniforms.gestureSeed, Number(gestureSeed) || 0);
    gl.uniform1f(uniforms.useActiveGlyph, activeIndexes.length > 0 ? 1 : 0);
    gl.uniform3f(uniforms.color, color[0], color[1], color[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  function updateGeometry(host, text, activeCharacterIndexes = []) {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const style = getComputedStyle(host);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const padding = Math.max(24, Math.ceil(fontSize * .36));
    const nextWidth = Math.ceil(rect.width + padding * 2);
    const nextHeight = Math.ceil(rect.height + padding * 2);
    const nextLeft = Math.round(rect.left - padding);
    const nextTop = Math.round(rect.top - padding);
    const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const nextKey = [
      text,
      rect.width.toFixed(2),
      rect.height.toFixed(2),
      fontSize,
      style.font,
      style.letterSpacing,
      style.fontKerning,
      padding,
      nextPixelRatio,
      activeCharacterIndexes.join(',')
    ].join('|');

    cssWidth = nextWidth;
    cssHeight = nextHeight;
    cssLeft = nextLeft;
    cssTop = nextTop;
    pixelRatio = nextPixelRatio;
    canvas.style.left = `${cssLeft}px`;
    canvas.style.top = `${cssTop}px`;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    if (maskKey !== nextKey) {
      maskKey = nextKey;
      canvas.width = Math.max(1, Math.floor(cssWidth * pixelRatio));
      canvas.height = Math.max(1, Math.floor(cssHeight * pixelRatio));
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      drawGlyphMask({ text, style, fontSize, padding, rect, activeCharacterIndexes });
    }

    return { style };
  }

  function drawGlyphMask({ text, style, fontSize, padding, rect, activeCharacterIndexes = [] }) {
    maskContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    maskContext.clearRect(0, 0, cssWidth, cssHeight);
    maskContext.textAlign = 'left';
    maskContext.textBaseline = 'alphabetic';
    maskContext.font = style.font && style.font !== 'normal' ? style.font : `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;

    const sample = Array.from(text)[0] || 'M';
    const metrics = maskContext.measureText(sample);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * .78;
    const descent = metrics.actualBoundingBoxDescent || fontSize * .22;
    const baseline = padding + (rect.height - ascent - descent) * .5 + ascent;
    const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
    const characters = Array.from(text);
    const activeIndexes = new Set(activeCharacterIndexes);

    maskContext.fillStyle = '#ff0000';
    if (activeIndexes.size === 0 && letterSpacing === 0) {
      maskContext.fillText(text, padding, baseline);
      return;
    }

    let x = padding;
    characters.forEach((character, index) => {
      maskContext.fillText(character, x, baseline);
      if (activeIndexes.has(index)) {
        maskContext.fillStyle = '#00ff00';
        maskContext.fillText(character, x, baseline);
        maskContext.fillStyle = '#ff0000';
      }
      x += maskContext.measureText(character).width + letterSpacing;
    });
  }

  return {
    get available() {
      return true;
    },
    render,
    hide,
    destroy(host) {
      hide(host);
    }
  };
}

function createUnavailableDiffusion() {
  return {
    available: false,
    render() {},
    hide() {},
    destroy() {}
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function readColor(value) {
  const channels = String(value).match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return [0.04, 0.05, 0.05];
  return channels.map((channel) => clamp(channel / 255, 0, 1));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
