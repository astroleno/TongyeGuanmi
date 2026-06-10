/*
  blob-volume.js
  ------------------------------------------------------------
  Lightweight CPU renderer for Soft Blob Glass / 古法失蜡琉璃.
  It does not use WebGL. It renders a small raymarched volume texture
  to Canvas2D, then injects that PNG into CSS pseudo-elements via
  --blob-volume-map and --blob-alpha-map.
*/

(() => {
  'use strict';

  const SELECTOR = '.blob-glass';
  const cache = new Map();
  const scheduled = new WeakMap();

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function readNumber(style, name, fallback) {
    const raw = style.getPropertyValue(name).trim();
    if (!raw) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function readRGB(style, name, fallback) {
    const raw = style.getPropertyValue(name).trim();
    if (!raw) return fallback;
    const nums = raw.match(/-?\d*\.?\d+/g);
    if (!nums || nums.length < 3) return fallback;
    return [
      clamp(Number(nums[0]) / 255, 0, 1),
      clamp(Number(nums[1]) / 255, 0, 1),
      clamp(Number(nums[2]) / 255, 0, 1)
    ];
  }

  /* Sine-domain fbm: cheaper than lattice noise but still gives low-frequency volume variation. */
  function fbm(x, y, z, seed) {
    let f = 1;
    let a = 0.52;
    let sum = 0;
    let norm = 0;

    for (let i = 0; i < 4; i += 1) {
      const p = seed * 17.31 + i * 31.17;
      const n1 = Math.sin(x * (1.62 * f) + y * (-0.92 * f) + z * (0.71 * f) + p);
      const n2 = Math.sin(x * (-0.73 * f) + y * (1.81 * f) + z * (1.27 * f) + p * 1.37);
      const n3 = Math.sin(x * (0.41 * f) + y * (0.63 * f) + z * (-1.53 * f) + p * 0.73);
      sum += ((n1 * n2 * 0.42 + n3 * 0.18) * 0.5 + 0.5) * a;
      norm += a;
      f *= 1.92;
      a *= 0.52;
    }

    return sum / norm;
  }

  function ellipsoid(x, y, z, s) {
    const dx = (x - s.x) / s.rx;
    const dy = (y - s.y) / s.ry;
    const dz = (z - s.z) / s.rz;
    const q = dx * dx + dy * dy + dz * dz;
    if (q >= 1) return 0;
    return s.w * Math.pow(1 - q, s.p || 1.65);
  }

  function torus(x, y, z, t) {
    const dx = x - t.x;
    const dy = (y - t.y) * (t.yScale || 1.22);
    const radial = Math.sqrt(dx * dx + dy * dy);
    const qx = (radial - t.major) / t.minor;
    const qz = (z - t.z) / t.minorZ;
    const q = qx * qx + qz * qz;
    if (q >= 1) return 0;
    return t.w * Math.pow(1 - q, t.p || 1.35);
  }

  function roundedVolume(x, y, z, b) {
    const n = b.n || 4.5;
    const dx = Math.abs((x - b.x) / b.rx);
    const dy = Math.abs((y - b.y) / b.ry);
    const dz = (z - b.z) / b.rz;
    const xy = Math.pow(Math.pow(dx, n) + Math.pow(dy, n), 2 / n);
    const q = xy + dz * dz;
    if (q >= 1) return 0;
    return b.w * Math.pow(1 - q, b.p || 1.72);
  }

  function makeProfile(kind, aspect, childCount, seed) {
    const boxes = [];
    const spheres = [];
    const tori = [];
    const wobble = (n) => (fbm(n * 1.7, seed * 2.3, n * 0.9, seed) - 0.5);

    if (kind === 'nav') {
      const count = Math.max(3, childCount || 4);
      const usable = Math.max(1.18, aspect * 0.52);
      const baseR = clamp(usable / (count * 0.66), 0.58, 0.82);

      boxes.push({ x: 0, y: 0.00, z: 0.00, rx: usable + baseR * 1.02, ry: 0.53, rz: 0.55, w: 0.88, p: 1.68, n: 4.8 });

      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const cx = lerp(-usable, usable, t);
        spheres.push({
          x: cx,
          y: wobble(i + 1) * 0.07,
          z: wobble(i + 5) * 0.06,
          rx: baseR * lerp(1.18, 1.04, Math.abs(t - 0.5) * 2),
          ry: 0.66 + wobble(i + 8) * 0.045,
          rz: 0.64 + wobble(i + 11) * 0.045,
          w: 0.24 + wobble(i + 14) * 0.040,
          p: 1.68
        });
      }

      /* continuous low-density body: the links sit inside it instead of becoming four beads */
      spheres.push({ x: -usable * 0.34, y: 0.11, z: -0.04, rx: usable * 0.42, ry: 0.32, rz: 0.34, w: 0.08, p: 1.85 });
      spheres.push({ x: usable * 0.30, y: -0.10, z: 0.06, rx: usable * 0.44, ry: 0.30, rz: 0.34, w: 0.08, p: 1.85 });
      tori.push({ x: 0.04, y: 0.00, z: 0.04, major: usable * 0.50, minor: 0.16, minorZ: 0.15, yScale: 1.22, w: 0.08, p: 1.2 });
      return { boxes, spheres, tori };
    }

    if (kind === 'button') {
      const spread = Math.max(0.44, aspect * 0.23);
      spheres.push({ x: -spread, y: -0.02, z: 0.04, rx: 0.68, ry: 0.62, rz: 0.68, w: 0.98, p: 1.58 });
      spheres.push({ x: spread * 0.82, y: 0.02, z: -0.03, rx: 0.62, ry: 0.58, rz: 0.62, w: 0.88, p: 1.62 });
      spheres.push({ x: 0.02, y: 0.02, z: 0.00, rx: spread + 0.50, ry: 0.38, rz: 0.43, w: 0.43, p: 1.88 });
      tori.push({ x: 0.02, y: 0.02, z: 0.02, major: Math.max(0.46, spread * 0.92), minor: 0.14, minorZ: 0.16, yScale: 1.45, w: 0.12, p: 1.22 });
      return { boxes, spheres, tori };
    }

    if (kind === 'rect') {
      const ax = Math.max(1.0, aspect);
      boxes.push({ x: 0.00, y: 0.00, z: 0.00, rx: ax * 0.86, ry: 0.74, rz: 0.56, w: 0.86, p: 1.70, n: 5.4 });
      boxes.push({ x: 0.02, y: -0.05, z: 0.18, rx: ax * 0.58, ry: 0.42, rz: 0.28, w: 0.16, p: 2.0, n: 4.4 });
      spheres.push({ x: -ax * 0.44, y: -0.36, z: 0.04, rx: ax * 0.28, ry: 0.34, rz: 0.46, w: 0.18, p: 1.76 });
      spheres.push({ x: ax * 0.42, y: -0.34, z: -0.04, rx: ax * 0.28, ry: 0.34, rz: 0.46, w: 0.16, p: 1.80 });
      spheres.push({ x: -ax * 0.40, y: 0.34, z: -0.03, rx: ax * 0.28, ry: 0.34, rz: 0.44, w: 0.12, p: 1.86 });
      spheres.push({ x: ax * 0.40, y: 0.36, z: 0.04, rx: ax * 0.28, ry: 0.34, rz: 0.46, w: 0.14, p: 1.82 });
      tori.push({ x: ax * 0.02, y: 0.00, z: 0.04, major: ax * 0.42, minor: 0.13, minorZ: 0.14, yScale: 0.88, w: 0.07, p: 1.28 });
      return { boxes, spheres, tori };
    }

    /* card / default: a large rectangular usable area made from soft volumes, not border radius. */
    const ax = Math.max(1.0, aspect);
    spheres.push({ x: -ax * 0.30, y: -0.38, z: 0.04, rx: ax * 0.52, ry: 0.72, rz: 0.72, w: 0.86, p: 1.55 });
    spheres.push({ x: ax * 0.24, y: -0.34, z: -0.05, rx: ax * 0.55, ry: 0.70, rz: 0.70, w: 0.82, p: 1.58 });
    spheres.push({ x: -ax * 0.34, y: 0.34, z: -0.02, rx: ax * 0.48, ry: 0.66, rz: 0.66, w: 0.72, p: 1.68 });
    spheres.push({ x: ax * 0.34, y: 0.30, z: 0.04, rx: ax * 0.47, ry: 0.68, rz: 0.70, w: 0.74, p: 1.63 });
    spheres.push({ x: 0.00, y: 0.03, z: 0.02, rx: ax * 0.70, ry: 0.78, rz: 0.60, w: 0.44, p: 1.95 });
    spheres.push({ x: -ax * 0.03, y: -0.05, z: 0.20, rx: ax * 0.48, ry: 0.36, rz: 0.38, w: 0.20, p: 1.8 });
    tori.push({ x: ax * 0.04, y: -0.06, z: 0.04, major: ax * 0.46, minor: 0.17, minorZ: 0.17, yScale: 1.08, w: 0.10, p: 1.22 });
    tori.push({ x: -ax * 0.28, y: 0.16, z: -0.03, major: ax * 0.30, minor: 0.13, minorZ: 0.15, yScale: 1.2, w: 0.07, p: 1.28 });
    return { boxes, spheres, tori };
  }

  function densityAt(x, y, z, profile) {
    let d = 0;
    for (let i = 0; i < (profile.boxes || []).length; i += 1) d += roundedVolume(x, y, z, profile.boxes[i]);
    for (let i = 0; i < profile.spheres.length; i += 1) d += ellipsoid(x, y, z, profile.spheres[i]);
    for (let i = 0; i < profile.tori.length; i += 1) d += torus(x, y, z, profile.tori[i]);
    return d;
  }

  function pigmentAt(x, y, z, noise, palette) {
    const roseW = smoothstep(-0.86, 0.88, -y + x * 0.16 + z * 0.34 + (noise - 0.5) * 0.48);
    const sageW = smoothstep(-0.82, 0.82, y - x * 0.22 - z * 0.16 + (0.5 - noise) * 0.36);
    const amberW = smoothstep(-0.78, 0.90, x + y * 0.28 + z * 0.20 + (noise - 0.5) * 0.30);
    const mauveW = smoothstep(-0.76, 0.84, -x * 0.70 - y * 0.20 + z * 0.15);
    const milkBias = 0.62 + Math.cos(z * 1.55) * 0.05;

    let r = palette.milk[0] * milkBias;
    let g = palette.milk[1] * milkBias;
    let b = palette.milk[2] * milkBias;

    r += palette.rose[0] * roseW * 0.23 + palette.sage[0] * sageW * 0.17 + palette.amber[0] * amberW * 0.20 + palette.mauve[0] * mauveW * 0.11;
    g += palette.rose[1] * roseW * 0.23 + palette.sage[1] * sageW * 0.17 + palette.amber[1] * amberW * 0.20 + palette.mauve[1] * mauveW * 0.11;
    b += palette.rose[2] * roseW * 0.23 + palette.sage[2] * sageW * 0.17 + palette.amber[2] * amberW * 0.20 + palette.mauve[2] * mauveW * 0.11;

    return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
  }

  function makeBubbles(kind, aspect, seed) {
    const count = kind === 'card' ? 7 : kind === 'nav' ? 4 : 2;
    const out = [];
    let state = Math.floor(seed * 1e9) || 12345;
    const rnd = () => {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      out.push({
        x: (rnd() - 0.5) * aspect * (kind === 'nav' ? 0.95 : 0.75),
        y: (rnd() - 0.5) * (kind === 'button' ? 0.34 : 0.78),
        r: lerp(0.025, kind === 'card' ? 0.070 : 0.045, rnd()),
        v: lerp(0.35, 0.90, rnd())
      });
    }

    return out;
  }

  function renderTexture(options) {
    const { width, height, kind, seed, steps, density, edgeSoftness, grain, bubble, parallax, palette, childCount } = options;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    const img = ctx.createImageData(width, height);
    const data = img.data;
    const total = width * height;
    const rBuf = new Float32Array(total);
    const gBuf = new Float32Array(total);
    const bBuf = new Float32Array(total);
    const aBuf = new Float32Array(total);
    const tBuf = new Float32Array(total);

    const aspect = width / Math.max(1, height);
    const profile = makeProfile(kind, aspect, childCount, seed);
    const bubbles = makeBubbles(kind, aspect, seed + 0.19);
    const zMin = -1.08;
    const zMax = 1.08;
    const zStep = (zMax - zMin) / Math.max(1, steps - 1);

    for (let yPix = 0; yPix < height; yPix += 1) {
      const v = height === 1 ? 0 : (yPix / (height - 1)) * 2 - 1;

      for (let xPix = 0; xPix < width; xPix += 1) {
        const u = width === 1 ? 0 : (xPix / (width - 1)) * 2 - 1;
        const x0 = u * aspect;
        const y0 = v;
        const rayX = x0 * 0.085;
        const rayY = -y0 * 0.060;
        let alpha = 0;
        let thick = 0;
        let cr = 0;
        let cg = 0;
        let cb = 0;

        const nBase = fbm(x0 * 0.48 + seed * 0.8, y0 * 0.48 - seed * 0.3, seed * 0.21, seed);
        const lowBase = fbm(x0 * 0.19 - seed, y0 * 0.19 + seed * 0.5, seed * 0.11, seed + 11.7);

        for (let s = 0; s < steps; s += 1) {
          const z = zMin + s * zStep;
          const x = x0 + rayX * z * parallax;
          const y = y0 + rayY * z * parallax;
          let rho = densityAt(x, y, z, profile);

          if (rho <= 0.0001 || alpha > 0.985) continue;

          const n = clamp(nBase + Math.sin(z * 1.73 + nBase * 6.283 + seed) * 0.075, 0, 1);
          rho *= density * clamp(0.73 + nBase * 0.30 + (lowBase - 0.5) * 0.18, 0.34, 1.22);

          const localAlpha = 1 - Math.exp(-rho * 0.215);
          const contrib = (1 - alpha) * localAlpha;
          const c = pigmentAt(x, y, z, n, palette);
          cr += c[0] * contrib;
          cg += c[1] * contrib;
          cb += c[2] * contrib;
          alpha += contrib;
          thick += rho;
        }

        const i = yPix * width + xPix;
        if (alpha > 0.0001) {
          rBuf[i] = cr / alpha;
          gBuf[i] = cg / alpha;
          bBuf[i] = cb / alpha;
        }
        aBuf[i] = alpha;
        tBuf[i] = thick / steps;
      }
    }

    const lightX = -0.43;
    const lightY = -0.62;
    const lightZ = 0.78;
    const lightLen = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ);

    for (let yPix = 0; yPix < height; yPix += 1) {
      const v = height === 1 ? 0 : (yPix / (height - 1)) * 2 - 1;
      for (let xPix = 0; xPix < width; xPix += 1) {
        const u = width === 1 ? 0 : (xPix / (width - 1)) * 2 - 1;
        const x0 = u * aspect;
        const i = yPix * width + xPix;
        const left = yPix * width + Math.max(0, xPix - 1);
        const right = yPix * width + Math.min(width - 1, xPix + 1);
        const up = Math.max(0, yPix - 1) * width + xPix;
        const down = Math.min(height - 1, yPix + 1) * width + xPix;

        const alphaRaw = aBuf[i];
        const thickness = tBuf[i];
        const dx = (tBuf[right] - tBuf[left]) * 18;
        const dy = (tBuf[down] - tBuf[up]) * 18;
        const nx = -dx;
        const ny = -dy;
        const nz = 1;
        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const ndl = clamp((nx * lightX + ny * lightY + nz * lightZ) / (nLen * lightLen), 0, 1);
        const t = clamp(thickness / 0.46, 0, 1);
        const edge = smoothstep(0.004, edgeSoftness, alphaRaw);
        let alpha = Math.pow(edge, 0.88) * 0.92;

        let r = rBuf[i];
        let g = gBuf[i];
        let b = bBuf[i];

        const shade = 0.76 + ndl * 0.32 - smoothstep(0.42, 1.0, t) * 0.12;
        const innerShadow = smoothstep(0.16, 0.86, t) * smoothstep(-0.9, 0.8, -x0 - v * 0.18) * 0.16;
        const upperWarmth = smoothstep(-0.9, 0.7, -v - x0 * 0.08) * smoothstep(0.10, 0.75, t) * 0.055;
        const milkyLift = (1 - smoothstep(0.18, 0.90, t)) * 0.06;
        const caustic = smoothstep(0.26, 0.88, -u * 0.40 - v * 0.64 + 0.22) * smoothstep(0.12, 0.64, t) * 0.075;
        const impurity = smoothstep(0.72, 0.97, fbm(x0 * 3.4 + 9.1, v * 3.4 - 3.7, seed * 0.4, seed + 29.4)) * grain * smoothstep(0.08, 0.65, t);

        let voidAmount = 0;
        if (bubble > 0.001 && t > 0.08) {
          for (let j = 0; j < bubbles.length; j += 1) {
            const bb = bubbles[j];
            const bx = (x0 - bb.x) / (bb.r * aspect * 0.40 + bb.r);
            const by = (v - bb.y) / bb.r;
            const d = Math.sqrt(bx * bx + by * by);
            voidAmount += smoothstep(1.05, 0.00, d) * bb.v;
          }
          voidAmount = clamp(voidAmount * bubble, 0, 0.14);
        }

        r = r * shade * (1 - innerShadow) + palette.milk[0] * milkyLift + palette.amber[0] * upperWarmth + caustic;
        g = g * shade * (1 - innerShadow) + palette.milk[1] * milkyLift + palette.amber[1] * upperWarmth + caustic;
        b = b * shade * (1 - innerShadow) + palette.milk[2] * milkyLift + palette.amber[2] * upperWarmth * 0.55 + caustic;

        r *= 1 - impurity * 0.050;
        g *= 1 - impurity * 0.055;
        b *= 1 - impurity * 0.060;

        r = r * (1 - voidAmount * 0.10) + palette.milk[0] * voidAmount * 0.12;
        g = g * (1 - voidAmount * 0.10) + palette.milk[1] * voidAmount * 0.12;
        b = b * (1 - voidAmount * 0.10) + palette.milk[2] * voidAmount * 0.12;
        alpha *= 1 - voidAmount * 0.16;

        const di = i * 4;
        data[di] = Math.round(clamp(r, 0, 1) * 255);
        data[di + 1] = Math.round(clamp(g, 0, 1) * 255);
        data[di + 2] = Math.round(clamp(b, 0, 1) * 255);
        data[di + 3] = Math.round(clamp(alpha, 0, 1) * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function getKind(el) {
    if (el.dataset.blobShape) return el.dataset.blobShape;
    if (el.classList.contains('blob-glass--nav')) return 'nav';
    if (el.classList.contains('blob-glass--button')) return 'button';
    return 'card';
  }

  function renderElement(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const style = getComputedStyle(el);
    const bleedX = readNumber(style, '--blob-bleed-x', 30);
    const bleedY = readNumber(style, '--blob-bleed-y', 24);
    const scaleRaw = readNumber(style, '--blob-map-scale', 0.72);
    const density = clamp(readNumber(style, '--blob-density', 0.92), 0.25, 1.75);
    const edgeSoftness = clamp(readNumber(style, '--blob-edge-softness', 0.54), 0.20, 0.90);
    const grain = clamp(readNumber(style, '--blob-grain', 0.10), 0, 1);
    const bubble = clamp(readNumber(style, '--blob-bubble', 0.18), 0, 1);
    const parallax = clamp(readNumber(style, '--blob-parallax', 0.42), 0, 1.2);
    const steps = clamp(Math.round(readNumber(style, '--blob-steps', 26)), 18, 48);
    const kind = getKind(el);
    const childCount = kind === 'nav' ? el.querySelectorAll('a,button,[data-blob-lobe]').length || 4 : 0;
    const seedRaw = el.dataset.blobSeed || style.getPropertyValue('--blob-seed').trim();
    const seed = Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : hashString(`${kind}|${el.textContent.trim()}|${rect.width.toFixed(1)}|${rect.height.toFixed(1)}`);

    let width = Math.max(48, Math.round((rect.width + bleedX * 2) * scaleRaw));
    let height = Math.max(48, Math.round((rect.height + bleedY * 2) * scaleRaw));
    const maxPixels = 180000;
    if (width * height > maxPixels) {
      const ratio = Math.sqrt(maxPixels / (width * height));
      width = Math.max(48, Math.round(width * ratio));
      height = Math.max(48, Math.round(height * ratio));
    }

    const palette = {
      milk: readRGB(style, '--blob-milk', [247 / 255, 239 / 255, 226 / 255]),
      rose: readRGB(style, '--blob-rose', [235 / 255, 141 / 255, 161 / 255]),
      sage: readRGB(style, '--blob-sage', [136 / 255, 171 / 255, 143 / 255]),
      amber: readRGB(style, '--blob-amber', [239 / 255, 174 / 255, 91 / 255]),
      mauve: readRGB(style, '--blob-mauve', [173 / 255, 145 / 255, 174 / 255])
    };

    const key = JSON.stringify({ width, height, kind, childCount, seed: Math.round(seed * 1e6), steps, density, edgeSoftness, grain, bubble, parallax, palette });
    let url = cache.get(key);
    if (!url) {
      url = renderTexture({ width, height, kind, seed, steps, density, edgeSoftness, grain, bubble, parallax, palette, childCount });
      cache.set(key, url);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
    }

    const cssUrl = `url("${url}")`;
    el.style.setProperty('--blob-volume-map', cssUrl);
    el.style.setProperty('--blob-alpha-map', cssUrl);
    el.dataset.blobReady = 'true';
  }

  function schedule(el) {
    if (scheduled.get(el)) return;
    scheduled.set(el, true);
    requestAnimationFrame(() => {
      scheduled.delete(el);
      renderElement(el);
    });
  }

  function attachPointer(el) {
    if (el.dataset.blobPointerAttached) return;
    el.dataset.blobPointerAttached = 'true';

    const reset = () => {
      el.style.setProperty('--blob-pointer-x', '0');
      el.style.setProperty('--blob-pointer-y', '0');
    };

    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      el.style.setProperty('--blob-pointer-x', clamp(x, -1, 1).toFixed(3));
      el.style.setProperty('--blob-pointer-y', clamp(y, -1, 1).toFixed(3));
    }, { passive: true });

    el.addEventListener('pointerleave', reset, { passive: true });
    el.addEventListener('blur', reset, true);
  }

  function init(root = document) {
    const nodes = [...root.querySelectorAll(SELECTOR)];
    if (!nodes.length) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) schedule(entry.target);
    });

    for (const el of nodes) {
      attachPointer(el);
      ro.observe(el);
      schedule(el);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  } else {
    init();
  }

  window.BlobGlassVolume = { init, renderElement };
})();
