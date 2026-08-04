import {
  HORIZONTAL_INK_SOFT_EDGE_HALF_WIDTH_PX,
  RADIAL_INK_CONTOUR_AMPLITUDE
} from '../transitions/shared/inkField.ts';
import { HORIZONTAL_INK_CONTOUR_AMPLITUDE } from '../transitions/shared/horizontalInkContour.ts';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
const NOISE_ATLAS_SIZE = 256;
let deterministicNoiseAtlas = null;
const INK_DIAGNOSTICS = import.meta.env.DEV;

function noiseAtlas() {
  if (deterministicNoiseAtlas) return deterministicNoiseAtlas;
  const pixels = new Uint8Array(NOISE_ATLAS_SIZE * NOISE_ATLAS_SIZE * 4);
  let state = 0x6d2b79f5;
  for (let index = 0; index < pixels.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 0xff;
  }
  deterministicNoiseAtlas = pixels;
  return pixels;
}

export function releaseInkWebGlResources(
  gl,
  { buffer = null, program = null, shaders = [], textures = [], loseContext = false } = {}
) {
  textures.forEach((texture) => {
    if (texture) gl.deleteTexture(texture);
  });
  if (buffer) gl.deleteBuffer(buffer);
  if (program) gl.deleteProgram(program);
  shaders.forEach((shader) => {
    if (shader) gl.deleteShader(shader);
  });
  // StrictMode can remount a reusable canvas immediately after cleanup. The
  // normal path releases resources but keeps that context available.
  if (loseContext) gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
}

export function createInkBoundaryTransition(canvas, options = {}) {
  if (!canvas) return null;
  const fieldKind = ['horizontal', 'radial', 'depth'].includes(options.fieldKind)
    ? options.fieldKind
    : 'radial';
  const targetImage = fieldKind === 'radial' && options.targetImage;
  const colorLift = clamp(options.colorLift ?? 0.32, 0, 1);
  const particleGain = clamp(options.particleGain ?? 1, 0, 2);
  const coverAlpha = clamp(options.coverAlpha ?? 0, 0, 1);
  const fadeOutStart = targetImage ? 0.995 : clamp(options.fadeOutStart ?? 0.94, 0, 0.98);
  const fadeOutEnd = targetImage ? 1 : Math.max(fadeOutStart + 0.01, clamp(options.fadeOutEnd ?? 0.995, 0.01, 1));
  const dprLimit = Math.max(0.5, Math.min(1.25, options.dprLimit ?? 1));
  if (targetImage && (!targetImage.complete || !(targetImage.naturalWidth > 0) || !(targetImage.naturalHeight > 0))) {
    return null;
  }
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance'
  });
  if (!gl) return null;

  const vertexSource = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  const fieldDefine = `#define F${fieldKind[0].toUpperCase()} 1\n#define FT ${targetImage ? 1 : 0}`;
  const fragmentSource = `${fieldDefine}
precision highp float;varying vec2 v;uniform vec2 R;uniform float P;uniform float T;uniform float S;uniform float C;uniform float G;uniform float A;uniform sampler2D N;
#if defined(FH)
uniform float D;uniform sampler2D M;uniform float Q;uniform float K;uniform float H;
#elif defined(FR)
uniform vec2 O;uniform float Z;uniform sampler2D M;uniform float H;
#if FT
uniform sampler2D U;uniform vec2 J;uniform float X;
#endif
#elif defined(FD)
uniform sampler2D X;uniform float Y;uniform vec2 V;uniform vec4 W;uniform vec4 J;uniform vec2 L;
#endif
uniform float B;uniform vec2 E;uniform float I;vec2 nu(vec2 p){vec2 so=vec2(S*73.17,S*151.31);return fract((p+so)/${NOISE_ATLAS_SIZE.toFixed(1)});}vec4 ad(vec2 p){return texture2D(N,(mod(floor(p),${NOISE_ATLAS_SIZE.toFixed(1)})+0.5)/${NOISE_ATLAS_SIZE.toFixed(1)});}float ah(vec2 p){return ad(p).r;}float f(vec2 p){vec4 pa4=texture2D(N,nu(p));return dot(pa4,vec4(0.533333,0.266667,0.133333,0.066667));}
#if defined(FH)
float hd(vec2 u,float d){return d<0.5?1.0-u.y:u.y;}vec4 hc(vec2 u){float sc=max(K,1.0);float cu=(clamp(u.x,0.0,1.0)*(sc-1.0)+0.5)/sc;return texture2D(M,vec2(cu,0.5));}
#elif defined(FR)
float rc(vec2 d,float as){float a=fract(atan(d.y,d.x)/6.2831853+1.0);vec3 hs=texture2D(M,vec2(a,0.5)).rgb*2.0-1.0;float n=dot(hs,vec3(0.50,0.31,0.19));float x=O.x*as;float tx=d.x>.000001?(as-x)/d.x:d.x<-.000001?-x/d.x:1e6;float ty=d.y>.000001?(1.0-O.y)/d.y:d.y<-.000001?-O.y/d.y:1e6;float l=min(tx,ty)/max(Z,0.0001);float e=sin(clamp(H,0.0,1.0)*3.14159265);return max(l*(1.0+n*${RADIAL_INK_CONTOUR_AMPLITUDE.toFixed(6)}*e),0.0001);}float rr(vec2 u,float as){vec2 d=(u-O)*vec2(as,1.0);return length(d)/max(Z*rc(d,as),0.0001);}
#if FT
vec2 ru(vec2 u){float sa=R.x/max(R.y,1.0);float ia=J.x/max(J.y,1.0);if(sa>ia){u.y=(u.y-0.5)*(ia/sa)+0.5;}else{u.x=(u.x-0.5)*(sa/ia)+0.5;}return u;}
#endif
#elif defined(FD)
float dr(vec2 u){vec2 vp=max(V,vec2(1.0));vec2 sp=vec2(u.x*vp.x,(1.0-u.y)*vp.y);vec2 cs=max(W.zw,vec2(1.0));vec2 co=W.xy+L*cs;float ca=max(J.x,0.0001);vec2 sx=co+(sp-J.yz-co)/ca;vec2 du=(sx-W.xy)/cs;float ii=step(0.0,du.x)*step(du.x,1.0)*step(0.0,du.y)*step(du.y,1.0);float sd=texture2D(X,vec2(du.x,1.0-du.y)).r;return mix(1.0,sd,ii*Y);}
#endif
float oo(float r,float gr,vec2 c,float am,float w){float hw=max(max(gr-c.x,c.y-gr),0.0001);float nd=abs(r-gr)/hw*w;float ev=1.0-smoothstep(0.18,1.0,nd);return clamp(am,0.0,1.0)*ev;}void main(){float p=clamp(P,0.0,1.0);float en=sin(p*3.14159265);float as=R.x/max(R.y,1.0);vec2 u=v;vec2 av=vec2(u.x*as,u.y);
#if defined(FH)
vec4 hq=hc(u);vec4 hs=hq*2.0-1.0;float hmain=dot(hs.rgb,vec3(0.50,0.31,0.19));float hphase=sin(clamp(H,0.0,1.0)*3.14159265);float br=hd(u,D)+hmain*${HORIZONTAL_INK_CONTOUR_AMPLITUDE.toFixed(6)}*hphase*Q;float br2=br+(hs.b*0.018+sin((u.x+H*0.37)*20.0)*0.010)*hphase*Q;float bp=H;
#elif defined(FR)
float br=rr(u,as);float bp=H;
#else
float br=dr(u);float bp=p;
#endif
vec2 ph=vec2(S*19.17+3.4,S*37.11+8.7);vec2 wu=av*2.35+ph;vec2 w=vec2(f(wu+vec2(1.7,4.1)),f(wu+vec2(8.3,2.2)))-0.5;float bd=f(av*2.10+w*0.72+ph*0.31);float wt=f(av*7.25+w*1.65+vec2(bd*1.7,0.0)-ph*0.17);float po=f(av*25.0-w*2.55+vec2(ph.y*0.11,bd*1.35));float cl=f(vec2(u.x*4.65+ph.x*0.13,bd*0.72+ph.y*0.09));float re=bp-br;float eb=1.0-smoothstep(0.02,0.34,abs(re));float ur=smoothstep(-0.30,-0.02,re)*(1.0-smoothstep(-0.02,0.04,re));float tn=smoothstep(0.56,0.92,cl+wt*0.30)*(eb*0.62+ur*0.72)*smoothstep(0.08,0.82,p);float md=f(av*4.5+w*1.65+ph*0.19)*0.30;md+=f(av*13.5-w*2.6-ph*0.23)*0.105;md+=f(av*31.0+w*3.2+ph*0.29)*0.035;float rp=sin((br*9.5+av.x*3.2+bd*2.2+S*6.2831853)*8.0)*0.006*en;float ob=smoothstep(0.30,0.72,f(av*8.4+w*2.6+ph*0.27));ob*=smoothstep(0.22,0.62,f(av*23.0-w*3.4-ph*0.21));float fi=(bd-0.5)*0.118+(wt-0.5)*0.078+(po-0.5)*0.024+md*0.10+rp;
#if defined(FH)
float me=dot(hs,vec4(0.026,0.016,0.009,0.007))*en*Q;fi+=me;
#endif
fi-=ob*eb*0.045;
#if defined(FH)
float fs=0.58;float ts=0.64;
#else
float fs=1.0;float ts=1.0;
#endif
float e=bp+tn*(0.058+wt*0.116)*ts-(br+fi*fs);
#if defined(FR)
// The radial body frontier is the exact contour shared with DOM ownership.
// Procedural sparks may cross this edge, but they cannot create a second
// opaque surface boundary that drifts away from Pattern's mask.
e=bp-br;
#endif
float b=smoothstep(-0.040,0.085,e);float ft=1.0-smoothstep(0.0,0.132,abs(e));float h=1.0-smoothstep(0.0,0.034,abs(e));float sb=1.0-smoothstep(0.034,0.112,abs(e));float pc=sb*I;float ow=clamp(1.0+fi*2.4+(wt-0.5)*0.35,0.62,1.38);float py=oo(br,B,E,I,ow);
#if defined(FH)
float ho=oo(br,B,E,I,1.0);float hh=max(max(B-E.x,E.y-B),0.0001);float sh=max(hh,${HORIZONTAL_INK_SOFT_EDGE_HALF_WIDTH_PX.toFixed(1)}/max(R.y,1.0));float so=(1.0-smoothstep(hh,sh,abs(br-B)))*0.46;float s2=(1.0-smoothstep(0.003,0.034,abs(br2-B)))*(0.36+0.22*hphase)*Q;float hb=smoothstep(-0.180,0.085,e)*0.64*Q;ho=max(ho,max(so,s2));float se=max(ho,hb);
#else
float se=max(pc,py);
#endif
float vn=smoothstep(0.66,0.97,wt+po*0.34)*ft;float os=smoothstep(0.64,0.90,ah(floor((av+w*0.68)*R.y*0.052+T*4.4)));float em=ft*os*(0.12+en*0.46);float pw=(1.0-smoothstep(0.026,0.290,abs(e)))*smoothstep(0.06,0.94,p);float sw=smoothstep(-0.240,-0.030,e)*(1.0-smoothstep(-0.030,0.130,e))*smoothstep(0.08,0.86,p);pw=max(pw*0.72,sw);vec2 pu=av*vec2(42.0,48.0)+w*1.35+vec2(0.0,-T*0.12);vec2 pi=floor(pu);vec2 pl=fract(pu)-0.5;vec4 pv=pw>.0?ad(pi+ph):vec4(0.);float ps=pv.r;vec2 pj=pv.gb-0.5;float pr=mix(.075,.19,pv.a);float pd=1.0-smoothstep(pr*.28,pr,length(pl-pj*0.38));float pa=pd*smoothstep(.79,.93,ps)*pw*(.4+en*.66)*G;float pk=pa*smoothstep(.55,.98,pd);float l=smoothstep(0.94,1.0,p);vec3 i=mix(vec3(0.006,0.012,0.010),vec3(0.016,0.032,0.026),bd*0.56);vec3 j=vec3(0.24,0.66,0.56);vec3 g=vec3(0.88,0.72,0.38);vec3 ec=mix(j,g,smoothstep(0.24,0.94,bd+po*0.24));vec3 c=i;c+=ec*(ft*0.24+h*0.22+vn*0.082+em*0.32+pa*0.88)*mix(0.24,0.86,C);c+=mix(j,g,ps)*pa*mix(0.16,0.58,C);c+=mix(vec3(0.28,0.78,0.66),vec3(0.96,0.80,0.42),ps)*pk*mix(0.22,0.74,C);c+=vec3(0.025,0.075,0.060)*ob*ft*mix(0.08,0.34,C);c+=ec*tn*md*0.08*mix(0.20,0.72,C);c=mix(c,vec3(0.004,0.008,0.007),l*0.35);float cw=b*A*(0.89+l*0.12);
#if defined(FR) && FT
vec4 tg=texture2D(U,ru(v));float ta=b*X;c=mix(c,tg.rgb,ta);
#endif
float a=cw;a+=ft*0.18+h*0.13+vn*0.05+em*0.28+pa*0.76+pk*0.36;
#if defined(FR) && FT
a=max(a,ta);
#endif
a=max(a,se);a=clamp(a,0.0,1.0);gl_FragColor=vec4(c,a);}
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Ink field shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    releaseInkWebGlResources(gl, { shaders: [vertexShader, fragmentShader] });
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    releaseInkWebGlResources(gl, { shaders: [vertexShader, fragmentShader] });
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Ink field shader link failed:', gl.getProgramInfoLog(program));
    releaseInkWebGlResources(gl, { program, shaders: [vertexShader, fragmentShader] });
    return null;
  }

  const buffer = gl.createBuffer();
  if (!buffer) {
    releaseInkWebGlResources(gl, { program, shaders: [vertexShader, fragmentShader] });
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'a');
  if (positionLocation < 0) {
    releaseInkWebGlResources(gl, { buffer, program, shaders: [vertexShader, fragmentShader] });
    return null;
  }
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'R'),
    progress: gl.getUniformLocation(program, 'P'),
    time: gl.getUniformLocation(program, 'T'),
    seed: gl.getUniformLocation(program, 'S'),
    colorLift: gl.getUniformLocation(program, 'C'),
    particleGain: gl.getUniformLocation(program, 'G'),
    coverAlpha: gl.getUniformLocation(program, 'A'),
    noiseAtlas: gl.getUniformLocation(program, 'N'),
    fieldDirection: gl.getUniformLocation(program, 'D'),
    fieldOrigin: gl.getUniformLocation(program, 'O'),
    fieldRadiusScale: gl.getUniformLocation(program, 'Z'),
    contourMap: gl.getUniformLocation(program, 'M'),
    contourReady: gl.getUniformLocation(program, 'Q'),
    contourSampleCount: gl.getUniformLocation(program, 'K'),
    ownershipThreshold: gl.getUniformLocation(program, 'H'),
    depthMap: gl.getUniformLocation(program, 'X'),
    depthReady: gl.getUniformLocation(program, 'Y'),
    depthViewport: gl.getUniformLocation(program, 'V'),
    depthCover: gl.getUniformLocation(program, 'W'),
    depthCamera: gl.getUniformLocation(program, 'J'),
    depthOrigin: gl.getUniformLocation(program, 'L'),
    ownershipGateRank: gl.getUniformLocation(program, 'B'),
    ownershipCore: gl.getUniformLocation(program, 'E'),
    occlusionAlphaMin: gl.getUniformLocation(program, 'I')
  };
  const targetUniforms = targetImage ? {
    map: gl.getUniformLocation(program, 'U'),
    size: gl.getUniformLocation(program, 'J'),
    ready: gl.getUniformLocation(program, 'X')
  } : null;

  const textures = [];
  const createTexture = (unit, wrap, width, height, pixels) => {
    const texture = gl.createTexture();
    if (!texture) return null;
    textures.push(texture);
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    return texture;
  };
  const depthTexture = fieldKind === 'depth'
    ? createTexture(gl.TEXTURE0, gl.CLAMP_TO_EDGE, 1, 1, new Uint8Array([255, 255, 255, 255]))
    : null;
  const contourTexture = fieldKind === 'horizontal' || fieldKind === 'radial'
    ? createTexture(
      gl.TEXTURE1,
      fieldKind === 'radial' ? gl.REPEAT : gl.CLAMP_TO_EDGE,
      1,
      1,
      new Uint8Array([128, 128, 128, 128])
    )
    : null;
  const noiseTexture = createTexture(
    gl.TEXTURE2,
    gl.REPEAT,
    NOISE_ATLAS_SIZE,
    NOISE_ATLAS_SIZE,
    noiseAtlas()
  );
  const targetTextureUnit = gl.TEXTURE3 ?? (gl.TEXTURE2 + 1);
  const targetTexture = targetImage
    ? createTexture(targetTextureUnit, gl.CLAMP_TO_EDGE, 1, 1, new Uint8Array([0, 0, 0, 0]))
    : null;
  if (
    (fieldKind === 'depth' && !depthTexture)
    || ((fieldKind === 'horizontal' || fieldKind === 'radial') && !contourTexture)
    || !noiseTexture
    || (targetImage && !targetTexture)
  ) {
    releaseInkWebGlResources(gl, { buffer, program, shaders: [vertexShader, fragmentShader], textures });
    return null;
  }
  if (targetTexture && targetImage) {
    gl.activeTexture(targetTextureUnit);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    // WebGL texture coordinates start at the lower left while the DOM image
    // starts at the upper left. Keep the target upload aligned with the DOM
    // Hero surface so the last canvas frame can hand off without a vertical
    // jump.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, targetImage);
  }

  let width = 0;
  let height = 0;
  let destroyed = false;
  let depthSource = '';
  let depthReady = false;
  let depthImage = null;
  let contourRevision = '';
  let contourTextureUploads = 0;

  const resize = (frame) => {
    const cssWidth = frame?.viewport?.width ?? canvas.clientWidth ?? window.innerWidth;
    const cssHeight = frame?.viewport?.height ?? canvas.clientHeight ?? window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, dprLimit);
    const nextWidth = Math.max(1, Math.round(cssWidth * ratio));
    const nextHeight = Math.max(1, Math.round(cssHeight * ratio));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    return cssWidth > 0 && cssHeight > 0;
  };

  const ensureDepthMap = (frame) => {
    if (!depthTexture || frame?.spec?.kind !== 'depth' || frame.spec.depthSrc === depthSource) {
      return;
    }
    depthSource = frame.spec.depthSrc;
    depthReady = false;
    if (typeof Image === 'undefined') {
      return;
    }
    const image = new Image();
    depthImage = image;
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (destroyed || image !== depthImage || frame.spec.depthSrc !== depthSource) {
        return;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      depthReady = true;
    };
    image.onerror = () => {
      if (image === depthImage) {
        depthReady = false;
      }
    };
    image.src = depthSource;
  };

  const ensureFieldContour = (frame) => {
    if (
      !contourTexture
      || frame?.spec?.kind !== fieldKind
      || (fieldKind !== 'horizontal' && fieldKind !== 'radial')
      || !frame.contour
    ) {
      return false;
    }
    if (frame.contour.revision === contourRevision) {
      return true;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, contourTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      frame.contour.samples.length,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frame.contour.texture
    );
    contourRevision = frame.contour.revision;
    if (INK_DIAGNOSTICS && canvas.dataset) {
      contourTextureUploads += 1;
      canvas.dataset.r4InkContourTextureUploads = String(contourTextureUploads);
      canvas.dataset.r4InkContourRevision = contourRevision;
    }
    return true;
  };

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA
  );
  gl.clearColor(0, 0, 0, 0);

  return {
    render(frame) {
      if (destroyed || !frame) return;
      const visibleProgress = clamp(frame.progress ?? 0, 0, 1);
      const fadeIn = smoothStep(clamp(visibleProgress / 0.06, 0, 1));
      const fadeOut = 1 - smoothStep(
        clamp((visibleProgress - fadeOutStart) / (fadeOutEnd - fadeOutStart), 0, 1)
      );
      const canvasOpacity = fadeIn * fadeOut;
      const active = canvasOpacity > 0.002;
      canvas.style.visibility = active ? 'visible' : 'hidden';
      canvas.style.opacity = active ? canvasOpacity.toFixed(4) : '0';
      ensureDepthMap(frame);
      const contourReady = ensureFieldContour(frame);
      if (!resize(frame)) return;

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!active) return;

      const spec = frame.spec;
      const origin = spec.kind === 'radial'
        ? spec.origin
        : spec.kind === 'horizontal'
          ? { x: 0.5, y: spec.direction === 'bottom-to-top' ? 1 : 0 }
          : { x: 0.5, y: 0.5 };
      const aspect = width / Math.max(height, 1);
      const radiusScale = Math.max(
        Math.hypot(origin.x * aspect, origin.y),
        Math.hypot((1 - origin.x) * aspect, origin.y),
        Math.hypot(origin.x * aspect, 1 - origin.y),
        Math.hypot((1 - origin.x) * aspect, 1 - origin.y)
      );
      const transform = spec.kind === 'depth' ? spec.transform : null;
      const depthViewport = transform?.viewport ?? { width, height };
      const depthCover = transform?.cover ?? { x: 0, y: 0, width: depthViewport.width, height: depthViewport.height };
      const depthCamera = transform?.camera ?? {
        scale: 1,
        translateX: 0,
        translateY: 0,
        originX: 0.5,
        originY: 0.5
      };

      gl.useProgram(program);
      if (depthTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      }
      if (contourTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, contourTexture);
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
      if (targetTexture) {
        gl.activeTexture(targetTextureUnit);
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      }
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.progress, visibleProgress);
      gl.uniform1f(uniforms.time, performance.now() * 0.001);
      gl.uniform1f(uniforms.seed, frame.seed / 0xffffffff);
      gl.uniform1f(uniforms.colorLift, colorLift);
      gl.uniform1f(uniforms.particleGain, particleGain);
      gl.uniform1f(uniforms.coverAlpha, coverAlpha);
      gl.uniform1i(uniforms.noiseAtlas, 2);
      if (spec.kind === 'horizontal') {
        gl.uniform1f(uniforms.fieldDirection, spec.direction === 'bottom-to-top' ? 1 : 0);
        gl.uniform1i(uniforms.contourMap, 1);
        gl.uniform1f(uniforms.contourReady, contourReady ? 1 : 0);
        gl.uniform1f(uniforms.contourSampleCount, frame.contour ? frame.contour.samples.length : 1);
        gl.uniform1f(uniforms.ownershipThreshold, frame.boundaryRank);
      } else if (spec.kind === 'radial') {
        gl.uniform2f(uniforms.fieldOrigin, origin.x, 1 - origin.y);
        gl.uniform1f(uniforms.fieldRadiusScale, radiusScale);
        gl.uniform1i(uniforms.contourMap, 1);
        gl.uniform1f(uniforms.ownershipThreshold, frame.boundaryRank);
        if (targetUniforms && targetTexture && targetImage) {
          gl.uniform1i(targetUniforms.map, targetTextureUnit - gl.TEXTURE0);
          gl.uniform2f(targetUniforms.size, targetImage.naturalWidth, targetImage.naturalHeight);
          gl.uniform1f(targetUniforms.ready, 1);
        }
      } else {
        gl.uniform1i(uniforms.depthMap, 0);
        gl.uniform1f(uniforms.depthReady, depthReady ? 1 : 0);
        gl.uniform2f(uniforms.depthViewport, depthViewport.width, depthViewport.height);
        gl.uniform4f(uniforms.depthCover, depthCover.x, depthCover.y, depthCover.width, depthCover.height);
        gl.uniform4f(uniforms.depthCamera, depthCamera.scale, depthCamera.translateX, depthCamera.translateY, 0);
        gl.uniform2f(uniforms.depthOrigin, depthCamera.originX, depthCamera.originY);
      }
      gl.uniform1f(uniforms.ownershipGateRank, frame.boundaryRank);
      gl.uniform2f(
        uniforms.ownershipCore,
        frame.occlusion.coreMin,
        frame.occlusion.coreMax
      );
      gl.uniform1f(uniforms.occlusionAlphaMin, frame.occlusion.alphaMin);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    prewarm(frame) {
      this.render(frame);
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
    },
    destroy(loseContext = false) {
      if (destroyed) return;
      destroyed = true;
      if (depthImage) {
        depthImage.onload = null;
        depthImage.onerror = null;
      }
      releaseInkWebGlResources(gl, {
        buffer,
        program,
        shaders: [vertexShader, fragmentShader],
        textures,
        loseContext
      });
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
      if (INK_DIAGNOSTICS && canvas.dataset) {
        delete canvas.dataset.r4InkContourTextureUploads;
        delete canvas.dataset.r4InkContourRevision;
      }
    }
  };
}
