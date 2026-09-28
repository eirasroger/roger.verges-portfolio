import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  BufferGeometry,
  BufferAttribute,
  DynamicDrawUsage,
  Color,
  ShaderMaterial,
  Points,
  Group,
  AdditiveBlending,
} from 'three';
import { gsap } from 'gsap';
import type { Formation } from '../data/projects';
import { clamp01, gauss, random, sequences, smooth, type SequenceSpec, type Vec } from './dioramas';

/**
 * The background particle field. One cloud of points plays every visual on the page: the name in
 * the hero, and for each project a diorama of what the project does (see dioramas.ts). The page tells
 * it, every frame, which formation to show and how far one has turned into the next.
 */

/** Points sampled from the hero's headline set in the page's own typeface, sized to the view. */
function nameShape(lines: string[], count: number, halfWidth: number, halfHeight: number, rnd: () => number): Vec[] {
  const W = 2000;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const setFont = (px: number) => {
    ctx.font = `650 expanded ${px}px "Mona Sans Variable", sans-serif`;
    ctx.fontStretch = 'expanded';
    ctx.letterSpacing = `${-0.035 * px}px`;
  };
  setFont(100);
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const size = (100 * W * 0.97) / widest;
  const lineHeight = size * 1.02;
  const H = Math.ceil(lineHeight * (lines.length - 1) + size * 1.12);
  canvas.width = W;
  canvas.height = H;
  setFont(size);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  lines.forEach((line, k) => ctx.fillText(line, W / 2, size * 0.86 + k * lineHeight));

  const { data } = ctx.getImageData(0, 0, W, H);
  const inked: number[] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 140) inked.push(x, y);
    }
  }
  if (!inked.length) return [];

  // As large as the view allows, leaving room for the line along the bottom.
  const width = Math.min(halfWidth * 2 * 0.74, halfHeight * 2 * 0.46 * (W / H));
  const k = width / W;
  const lift = halfHeight * 0.17;
  return Array.from({ length: count }, (): Vec => {
    const pick = Math.floor(rnd() * (inked.length / 2)) * 2;
    return [(inked[pick] + rnd() * 2 - W / 2) * k, -(inked[pick + 1] + rnd() * 2 - H / 2) * k + lift, gauss(rnd) * 0.015, 0.95];
  });
}

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uAgitation;
  uniform vec2 uPointer;
  uniform vec2 uDrag;
  uniform float uHover;
  uniform float uAspect;
  uniform float uPart;
  uniform float uDrift;
  uniform float uSizeMul;
  attribute float aSeed;
  attribute float aDust;
  attribute float aTone;
  varying float vAlpha;
  varying float vTone;
  varying float vGlow;
  void main() {
    vec3 p = position;
    // Dust floats freely; points that belong to a shape only tremble.
    float a = uDrift + uAgitation + aDust * 0.3;
    p += a * vec3(
      sin(uTime * 0.7 + aSeed * 40.0),
      cos(uTime * 0.6 + aSeed * 23.0),
      sin(uTime * 0.5 + aSeed * 11.0)
    );
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Near the pointer, points ease aside and are carried along its motion like a wake: a soft
    // bell-shaped reach, a different response per point so no clean ring forms, and a slight swirl.
    vec4 clip = projectionMatrix * mv;
    vec2 d = clip.xy / clip.w - uPointer;
    d.x *= uAspect;
    float r2 = dot(d, d);
    float reach = exp(-r2 / 0.014) * uPart * uHover;
    float r = sqrt(r2) + 0.0001;
    vec2 away = d / r;
    vec2 around = vec2(-away.y, away.x);
    float response = 0.55 + aSeed * 0.9;
    float speed = length(uDrag);
    vec2 offset = away * (0.07 + speed * 0.18) + uDrag * 0.85 + around * speed * (aSeed - 0.5) * 0.6;
    mv.xyz += vec3(offset * reach * response, reach * 0.25);
    vGlow = reach;
    gl_Position = projectionMatrix * mv;
    float tone = max(aTone, 0.0);
    gl_PointSize = uSize * uSizeMul * (0.45 + aSeed * 0.9) * (0.8 + tone * 0.4) / -mv.z;
    // Below zero, tone fades a point out entirely.
    vAlpha = (0.25 + 0.75 * aSeed) * (1.0 - aDust * 0.55) * (0.5 + tone * 0.7) * clamp(1.0 + aTone, 0.0, 1.0);
    vTone = tone;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vTone;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.05, d);
    // Bright points run hot toward white; quiet ones keep the project's colour.
    vec3 color = mix(uColor * 0.85, vec3(1.0), smoothstep(0.6, 1.0, vTone) * 0.7);
    // A faint glow where the pointer passes.
    color = mix(color, vec3(1.0), vGlow * 0.35);
    gl_FragColor = vec4(color, disc * vAlpha * uOpacity * (1.0 + vGlow * 0.6));
  }
`;

export interface FieldState {
  formation: Formation;
  color: string;
  /** Horizontal position of the diorama, as a fraction of the half-width of the view (-1 to 1). */
  x: number;
  /** Vertical position, as a fraction of the half-height of the view (-1 bottom to 1 top). */
  y?: number;
  scale: number;
  opacity: number;
  /** How far through the formation's stages, from 0 to 1. */
  stage?: number;
}

export interface Field {
  /**
   * Show formation `a` turning into formation `b`, `t` of the way (0 is all `a`, 1 is all `b`).
   * The page calls this every frame from the scroll position, so the field is a direct function of it.
   */
  show(a: FieldState, b: FieldState, t: number): void;
  /** 0 when still; grows with scroll speed. */
  agitate(amount: number): void;
  destroy(): void;
}

interface Stage {
  pos: Float32Array;
  tone: Float32Array;
  rx: number;
  ry: number;
}

/** How the field behaves per formation: the name stays nearly still to stay legible. */
const FEEL_NAME = { sway: 0.008, tilt: 0.05, part: 1, drift: 0.004, size: 0.58 };
const FEEL_SHAPE = { sway: 0.1, tilt: 1, part: 0, drift: 0.025, size: 0.75 };

/**
 * `headline` is the text the hero's formation ('name') draws, one entry per line.
 */
export function createField(
  canvas: HTMLCanvasElement,
  { still = false, headline = [] as string[] } = {},
): Field | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const small = matchMedia('(max-width: 48rem)').matches;
  const count = small ? 9000 : 20000;
  // A share of the points never joins a shape: dust drifting through the whole view, the same in
  // every formation, so the space around each diorama never goes empty.
  const dust = Math.round(count * 0.14);
  const shaped = count - dust;

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 9;

  const seedRnd = random(3);
  const seeds = new Float32Array(count).map(() => seedRnd());
  const uRnd = random(11);
  const perPoint = Array.from({ length: shaped }, (): [number, number, number] => [uRnd(), uRnd(), uRnd()]);
  const dustRnd = random(29);
  const dustAt = Array.from({ length: dust }, () => [(dustRnd() - 0.5) * 20, (dustRnd() - 0.5) * 12, -6 + dustRnd() * 8]);

  function withDust(pos: Float32Array, tone: Float32Array) {
    for (let j = 0; j < dust; j++) {
      pos.set(dustAt[j], (shaped + j) * 3);
      tone[shaped + j] = 0.3;
    }
  }

  // Every stage of every static formation, baked into flat buffers once; live ones keep their roles.
  const rolesOf = {} as Record<Formation, number[]>;
  function bake(name: Formation, spec: SequenceSpec, seed: number): Stage[] {
    const total = spec.roles.reduce((a, b) => a + b, 0);
    const roleRnd = random(seed);
    const roles = Array.from({ length: shaped }, () => {
      let r = roleRnd() * total;
      let k = 0;
      while (r > spec.roles[k] && k < spec.roles.length - 1) r -= spec.roles[k++];
      return k;
    });
    rolesOf[name] = roles;
    const k = spec.scale ?? 1;
    return spec.stages.map((stage, s) => {
      const pos = new Float32Array(count * 3);
      const tone = new Float32Array(count);
      const rnd = random(seed * 7 + s);
      for (let i = 0; i < shaped; i++) {
        const [x, y, z, t] = stage.at({ role: roles[i], u: perPoint[i], s: seeds[i], time: 0, rnd });
        pos[i * 3] = x * k;
        pos[i * 3 + 1] = y * k;
        pos[i * 3 + 2] = z * k;
        tone[i] = t;
      }
      withDust(pos, tone);
      return { pos, tone, rx: stage.rx, ry: stage.ry };
    });
  }
  const baked = {} as Record<Formation, Stage[]>;
  (Object.keys(sequences) as Array<keyof typeof sequences>).forEach((name, k) => {
    baked[name] = bake(name, sequences[name], 17 + k * 101);
  });
  baked.name = baked.scatter;

  const current = baked.scatter[0].pos.slice();
  const currentTone = baked.scatter[0].tone.slice();
  const from = current.slice();
  const fromTone = currentTone.slice();
  const posA = new Float32Array(count * 3);
  const toneA = new Float32Array(count);
  const posB = new Float32Array(count * 3);
  const toneB = new Float32Array(count);

  const geometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(current, 3);
  const toneAttr = new BufferAttribute(currentTone, 1);
  positionAttr.setUsage(DynamicDrawUsage);
  toneAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('aTone', toneAttr);
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  geometry.setAttribute('aDust', new BufferAttribute(new Float32Array(count).map((_, i) => (i >= shaped ? 1 : 0)), 1));

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: 0 },
    uAgitation: { value: 0 },
    uColor: { value: new Color('#cfd6de') },
    uOpacity: { value: 0 },
    uPointer: { value: [9, 9] as [number, number] },
    uDrag: { value: [0, 0] as [number, number] },
    uHover: { value: 0 },
    uAspect: { value: 1 },
    uPart: { value: 0 },
    uDrift: { value: 0.025 },
    uSizeMul: { value: 1 },
  };
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const group = new Group();
  group.add(new Points(geometry, material));
  scene.add(group);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  // The pointer as the distortion sees it: eased toward the mouse, with a smoothed velocity, and a
  // strength that fades in when the mouse is over the page and out, in place, when it leaves.
  const hover = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, strength: 0, active: false, placed: false };
  // `entry` pours the points in from wherever they were: on load, and when the name is redrawn.
  const entry = { value: 0 };
  const fadeIn = { value: 0 };
  let request: { a: FieldState; b: FieldState; t: number } | null = null;
  let lastKey = '';
  let agitation = 0;
  let halfWidth = 1;
  let halfHeight = 1;
  const colors = new Map<string, Color>();
  const colorOf = (hex: string) => {
    let c = colors.get(hex);
    if (!c) colors.set(hex, (c = new Color(hex)));
    return c;
  };

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfHeight = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    halfWidth = halfHeight * camera.aspect;
    uniforms.uSize.value = (small ? 32 : 28) * dpr;
    uniforms.uAspect.value = camera.aspect;
  }

  function pour(duration: number) {
    from.set(current);
    fromTone.set(currentTone);
    entry.value = 0;
    gsap.to(entry, { value: 1, duration: still ? 0 : duration, ease: 'power2.inOut', overwrite: 'auto' });
  }

  function buildName() {
    const shape = nameShape(headline, shaped, halfWidth, halfHeight, random(7));
    if (!shape.length) return;
    const pos = new Float32Array(count * 3);
    const tone = new Float32Array(count);
    shape.forEach(([x, y, z, t], i) => {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      tone[i] = t;
    });
    withDust(pos, tone);
    baked.name = [{ pos, tone, rx: 0, ry: 0 }];
    lastKey = '';
    if (entry.value >= 1) pour(1);
  }

  let resizeTimer = 0;
  function onResize() {
    resize();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(buildName, 200);
  }

  const isLive = (f: Formation) => f !== 'name' && Boolean(sequences[f as keyof typeof sequences].live);

  /** Write where formation `state` puts every point into `pos`/`tone`; returns its rotation. */
  function evaluate(state: FieldState, time: number, pos: Float32Array, tone: Float32Array) {
    const f = state.formation;
    if (isLive(f)) {
      const spec = sequences[f as keyof typeof sequences];
      const at = spec.stages[0].at;
      const roles = rolesOf[f];
      const k = spec.scale ?? 1;
      const fixed = () => 0.5;
      for (let i = 0; i < shaped; i++) {
        const [x, y, z, t] = at({ role: roles[i], u: perPoint[i], s: seeds[i], time, rnd: fixed });
        pos[i * 3] = x * k;
        pos[i * 3 + 1] = y * k;
        pos[i * 3 + 2] = z * k;
        tone[i] = t;
      }
      const first = baked[f][0];
      pos.set(first.pos.subarray(shaped * 3), shaped * 3);
      tone.set(first.tone.subarray(shaped), shaped);
      return { rx: first.rx, ry: first.ry };
    }
    const stages = baked[f];
    const last = stages.length - 1;
    const at = clamp01(state.stage ?? 0) * last;
    const k = Math.min(Math.max(0, last - 1), Math.floor(at));
    const a = stages[k];
    const b = stages[Math.min(last, k + 1)];
    const t = clamp01(at - k);
    if (t <= 0) {
      pos.set(a.pos);
      tone.set(a.tone);
    } else {
      for (let i = 0; i < count; i++) {
        // Each point moves a little after the last, so a change of shape pours rather than snaps.
        const e = smooth(clamp01(t * 1.5 - seeds[i] * 0.5));
        const j = i * 3;
        pos[j] = a.pos[j] + (b.pos[j] - a.pos[j]) * e;
        pos[j + 1] = a.pos[j + 1] + (b.pos[j + 1] - a.pos[j + 1]) * e;
        pos[j + 2] = a.pos[j + 2] + (b.pos[j + 2] - a.pos[j + 2]) * e;
        tone[i] = a.tone[i] + (b.tone[i] - a.tone[i]) * e;
      }
    }
    return { rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t };
  }

  let rot = { rx: 0, ry: 0 };
  function update(time: number) {
    if (!request) return;
    const { a, b, t } = request;
    const live = isLive(a.formation) || (t > 0 && isLive(b.formation));
    const key = `${a.formation}|${a.stage ?? 0}|${b.formation}|${b.stage ?? 0}|${t}`;
    if (!live && key === lastKey && entry.value >= 1) return;
    lastKey = key;

    const rotA = evaluate(a, time, posA, toneA);
    if (t > 0) {
      const rotB = evaluate(b, time, posB, toneB);
      for (let i = 0; i < count; i++) {
        const e = smooth(clamp01(t * 1.6 - seeds[i] * 0.6));
        const j = i * 3;
        posA[j] += (posB[j] - posA[j]) * e;
        posA[j + 1] += (posB[j + 1] - posA[j + 1]) * e;
        posA[j + 2] += (posB[j + 2] - posA[j + 2]) * e;
        toneA[i] += (toneB[i] - toneA[i]) * e;
      }
      rot = { rx: rotA.rx + (rotB.rx - rotA.rx) * t, ry: rotA.ry + (rotB.ry - rotA.ry) * t };
    } else {
      rot = rotA;
    }

    if (entry.value >= 1) {
      current.set(posA);
      currentTone.set(toneA);
    } else {
      for (let i = 0; i < count; i++) {
        const e = smooth(clamp01(entry.value * 1.6 - seeds[i] * 0.6));
        const j = i * 3;
        current[j] = from[j] + (posA[j] - from[j]) * e;
        current[j + 1] = from[j + 1] + (posA[j + 1] - from[j + 1]) * e;
        current[j + 2] = from[j + 2] + (posA[j + 2] - from[j + 2]) * e;
        currentTone[i] = fromTone[i] + (toneA[i] - fromTone[i]) * e;
      }
    }
    positionAttr.needsUpdate = true;
    toneAttr.needsUpdate = true;
  }

  const mix = (x: number, y: number, t: number) => x + (y - x) * t;

  function render(time: number) {
    uniforms.uTime.value = time;
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    agitation += (0 - agitation) * 0.05;
    if (hover.placed) {
      const nx = hover.x + (hover.tx - hover.x) * 0.16;
      const ny = hover.y + (hover.ty - hover.y) * 0.16;
      hover.vx += (nx - hover.x - hover.vx) * 0.18;
      hover.vy += (ny - hover.y - hover.vy) * 0.18;
      hover.x = nx;
      hover.y = ny;
    }
    hover.strength += ((hover.active ? 1 : 0) - hover.strength) * (hover.active ? 0.08 : 0.04);
    // Velocity from screen units to world units, capped so a flick never tears the shape apart.
    let dx = hover.vx * halfWidth * 3;
    let dy = hover.vy * halfHeight * 3;
    const len = Math.hypot(dx, dy);
    if (len > 0.3) {
      dx *= 0.3 / len;
      dy *= 0.3 / len;
    }
    uniforms.uPointer.value = [hover.x, hover.y];
    uniforms.uDrag.value = [dx, dy];
    uniforms.uHover.value = hover.strength;
    update(time);

    if (request) {
      const { a, b, t } = request;
      const e = smooth(t);
      const fa = a.formation === 'name' ? FEEL_NAME : FEEL_SHAPE;
      const fb = b.formation === 'name' ? FEEL_NAME : FEEL_SHAPE;
      const ca = colorOf(a.color);
      const cb = colorOf(b.color);
      (uniforms.uColor.value as Color).setRGB(mix(ca.r, cb.r, e), mix(ca.g, cb.g, e), mix(ca.b, cb.b, e));
      uniforms.uOpacity.value = mix(a.opacity, b.opacity, e) * fadeIn.value;
      uniforms.uPart.value = mix(fa.part, fb.part, e);
      uniforms.uDrift.value = mix(fa.drift, fb.drift, e);
      uniforms.uSizeMul.value = mix(fa.size, fb.size, e);
      const sway = mix(fa.sway, fb.sway, e);
      const tilt = mix(fa.tilt, fb.tilt, e);
      group.position.set(mix(a.x, b.x, e) * halfWidth, mix(a.y ?? 0, b.y ?? 0, e) * halfHeight, 0);
      group.scale.setScalar(mix(a.scale, b.scale, e));
      group.rotation.x = rot.rx + pointer.y * 0.14 * tilt;
      group.rotation.y = rot.ry + (still ? 0 : Math.sin(time * 0.15) * sway) + pointer.x * 0.25 * tilt;
    }
    uniforms.uAgitation.value = agitation;
    renderer.render(scene, camera);
  }

  const tick = (time: number) => {
    if (!document.hidden) render(time);
  };

  const onPointer = (event: PointerEvent) => {
    pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    if (event.pointerType !== 'mouse') return;
    hover.tx = pointer.tx;
    hover.ty = -pointer.ty;
    if (!hover.placed) {
      hover.x = hover.tx;
      hover.y = hover.ty;
      hover.placed = true;
    }
    hover.active = true;
  };
  const onLeave = () => {
    hover.active = false;
  };

  resize();
  window.addEventListener('resize', onResize);
  if (!still) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
  }
  // The name needs the web font before it can be drawn into points.
  document.fonts.load('650 100px "Mona Sans Variable"').then(buildName, buildName);
  gsap.to(fadeIn, { value: 1, duration: still ? 0 : 1.2, ease: 'power2.out' });
  pour(2.4);
  gsap.ticker.add(tick);

  return {
    show(a, b, t) {
      request = { a, b, t: clamp01(t) };
    },
    agitate(amount) {
      agitation = Math.max(agitation, Math.min(amount, 0.2));
    },
    destroy() {
      gsap.ticker.remove(tick);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
