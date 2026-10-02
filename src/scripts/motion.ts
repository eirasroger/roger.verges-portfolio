import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import type { Formation } from '../data/projects';
import type { Field, FieldState } from './field';
import { createOrbit } from './orbit';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

declare global {
  interface Window {
    __motionReady?: boolean;
  }
}

const root = document.documentElement;
const $ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
  scope.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll<T>(selector));

const EXPO = 'expo.out';
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

function intro(onDone: () => void) {
  gsap.fromTo('[data-hero-fade]', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.4, delay: 1.1, ease: EXPO, onComplete: onDone });
}

function heroExit() {
  gsap.to('[data-hero-fade]', {
    opacity: 0,
    y: -20,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '60% top', scrub: true },
  });
}

/** Desktop: pin projects whose diorama forms in stages. */
function holdScenes() {
  for (const scene of $$('[data-scene][data-hold]')) {
    ScrollTrigger.create({ trigger: scene, start: 'top top', end: '+=130%', pin: true });
  }
}

/** Each project panel arrives with its contents, so the panel is never seen empty. */
function reveals() {
  const panels = $$('[data-scene] [data-reveal-panel]');
  for (const panel of panels) {
    gsap.set(panel, { opacity: 0, y: 28 });
    gsap.set($$('[data-reveal]', panel), { opacity: 0, y: 16 });
  }
  ScrollTrigger.batch(panels, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      batch.forEach((panel) => {
        gsap.to(panel, { opacity: 1, y: 0, duration: 1.1, ease: EXPO });
        gsap.to($$('[data-reveal]', panel), { opacity: 1, y: 0, duration: 1.1, ease: EXPO, stagger: 0.07, delay: 0.1 });
      }),
  });
}

/** Drives the field from the scroll position: stages within a section, blends across boundaries. */
function follow(desktop: boolean, getField: () => Field | null) {
  // A pinned section is measured by its spacer, which spans the whole pin.
  const sections = $$('[data-field]').map((el) =>
    el.parentElement?.classList.contains('pin-spacer') ? (el.parentElement as HTMLElement) : el,
  );
  const railLinks = $$<HTMLElement>('[data-rail-link]');
  const stateOf = (outer: HTMLElement, stage: number): FieldState => {
    const el = outer.classList.contains('pin-spacer') ? (outer.firstElementChild as HTMLElement) : outer;
    const isName = el.dataset.field === 'name';
    const fit = desktop || isName ? 1 : Math.min(1, (window.innerWidth / window.innerHeight) * 0.95);
    const opacity = Number(el.dataset.fieldOpacity ?? 1) * (desktop || isName ? 1 : 0.45);
    return {
      formation: el.dataset.field as Formation,
      color: el.dataset.accent ?? '#5f6b7d',
      x: desktop ? Number(el.dataset.fieldX ?? 0) : 0,
      y: desktop || isName ? 0 : 0.28,
      scale: Number(el.dataset.fieldScale ?? 1) * fit,
      opacity,
      stage,
    };
  };

  let lastActive = '';
  const tick = () => {
    const field = getField();
    const mid = window.innerHeight * 0.5;
    const rects = sections.map((el) => el.getBoundingClientRect());
    // Half-depth of the blend zone around a boundary.
    const zone = window.innerHeight * 0.38;

    let k = 0;
    rects.forEach((r, i) => {
      if (r.top <= mid) k = i;
    });
    const stageOf = (i: number) => {
      const r = rects[i];
      return clamp01((mid - r.top - zone) / Math.max(1, r.height - 2 * zone));
    };

    let a = k;
    let b = k;
    let t = 0;
    const past = mid - rects[k].top;
    const left = rects[k].bottom - mid;
    if (k < sections.length - 1 && left < zone) {
      b = k + 1;
      t = 0.5 - left / (2 * zone);
    } else if (k > 0 && past < zone) {
      a = k - 1;
      t = 0.5 + past / (2 * zone);
    }
    const sa = stateOf(sections[a], stageOf(a));
    const sb = stateOf(sections[b], stageOf(b));
    field?.show(sa, sb, t);

    const leadOuter = t < 0.5 ? sections[a] : sections[b];
    const lead = leadOuter.classList.contains('pin-spacer') ? (leadOuter.firstElementChild as HTMLElement) : leadOuter;
    if (lead.id !== lastActive) {
      lastActive = lead.id;
      railLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.railLink === lead.id));
    }
  };

  gsap.ticker.add(tick);
  const agitation = ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => getField()?.agitate(Math.abs(self.getVelocity()) / 12000),
  });
  return () => {
    gsap.ticker.remove(tick);
    agitation.kill();
  };
}

function rail(smoother: ScrollSmoother | null) {
  const nav = $('[data-rail]');
  if (!nav) return;
  const visible = ScrollTrigger.create({
    trigger: '#work',
    start: 'top 55%',
    endTrigger: '[data-orbit-section]',
    end: 'top 55%',
    toggleClass: { targets: nav, className: 'is-visible' },
  });
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-rail-link]');
    if (!link || !smoother) return;
    event.preventDefault();
    smoother.scrollTo(`#${link.dataset.railLink}`, true, 'top top');
  };
  nav.addEventListener('click', onClick);
  return () => {
    visible.kill();
    nav.removeEventListener('click', onClick);
  };
}

// three.js loads last; without WebGL the headline shows as text.
const canvas = $<HTMLCanvasElement>('[data-field-canvas]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let field: Field | null = null;
const settleField = (ok: boolean) => {
  root.classList.toggle('has-field', ok);
  root.classList.remove('field-pending');
};
if (canvas) {
  import('./field').then(
    ({ createField }) => {
      const headline = ($('[data-field-text]')?.dataset.fieldText ?? '').split('|').filter(Boolean);
      field = createField(canvas, { still: reduced, headline });
      settleField(Boolean(field));
      if (field) requestAnimationFrame(() => canvas.classList.add('is-on'));
    },
    () => settleField(false),
  );
} else {
  settleField(false);
}

const mm = gsap.matchMedia();

mm.add(
  {
    motion: '(prefers-reduced-motion: no-preference)',
    desktop: '(min-width: 64rem)',
    fine: '(hover: hover) and (pointer: fine)',
  },
  (context) => {
    const { motion, desktop, fine } = context.conditions as Record<string, boolean>;
    const cleanups: Array<(() => void) | void> = [];
    const orbitSection = $('[data-orbit-section]');

    if (!motion) {
      root.classList.remove('motion');
      cleanups.push(follow(desktop, () => field));
      if (orbitSection) cleanups.push(createOrbit(orbitSection, { still: true }));
      cleanups.push(rail(null));
      return () => cleanups.forEach((fn) => fn?.());
    }

    const smoother = fine
      ? ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 1.1 })
      : null;

    window.__motionReady = true;
    intro(() => {
      // Drop the CSS start state so a later revert can't hide the hero.
      root.classList.remove('motion');
      context.add(heroExit);
    });

    if (desktop) holdScenes();
    reveals();
    cleanups.push(follow(desktop, () => field));
    if (orbitSection) cleanups.push(createOrbit(orbitSection));
    cleanups.push(rail(smoother));

    return () => {
      cleanups.forEach((fn) => fn?.());
      smoother?.kill();
    };
  },
);

// Web fonts shift layout, and so trigger positions.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
