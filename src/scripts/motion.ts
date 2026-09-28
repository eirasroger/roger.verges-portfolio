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

/** On load the field gathers into the name (see field.ts); the line beneath it follows. */
function intro(onDone: () => void) {
  gsap.fromTo('[data-hero-fade]', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.4, delay: 1.1, ease: EXPO, onComplete: onDone });
}

/** Leaving the hero: the line beneath the name fades as the letters pour into the first project. */
function heroExit() {
  gsap.to('[data-hero-fade]', {
    opacity: 0,
    y: -20,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '60% top', scrub: true },
  });
}

/**
 * Desktop: a project whose diorama forms in stages holds still while you scroll through it, so its
 * text stays put while the diorama plays. The field follows the whole held stretch (the pin's
 * spacer), so it keeps moving.
 */
function holdScenes() {
  for (const scene of $$('[data-scene][data-hold]')) {
    ScrollTrigger.create({ trigger: scene, start: 'top top', end: '+=130%', pin: true });
  }
}

/** Each project's text arrives once as it comes into view, and then stays put. */
function reveals() {
  const targets = $$('[data-scene] [data-reveal]');
  gsap.set(targets, { opacity: 0, y: 28 });
  ScrollTrigger.batch(targets, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: EXPO, stagger: 0.08 }),
  });
}

/**
 * The particle field follows the scroll position directly. Inside a section its diorama plays through
 * its stages as the section passes; around the boundary between two sections one diorama melts into
 * the next. Scrolling back reverses exactly, and nothing plays on a timer.
 */
function follow(desktop: boolean, getField: () => Field | null) {
  // A held section is measured by its pin spacer, which spans the whole held stretch.
  const sections = $$('[data-field]').map((el) =>
    el.parentElement?.classList.contains('pin-spacer') ? (el.parentElement as HTMLElement) : el,
  );
  const railLinks = $$<HTMLElement>('[data-rail-link]');
  const stateOf = (outer: HTMLElement, stage: number): FieldState => {
    const el = outer.classList.contains('pin-spacer') ? (outer.firstElementChild as HTMLElement) : outer;
    const isName = el.dataset.field === 'name';
    // On narrow screens a diorama sits centred and higher, sized to the width, and quieter under the text.
    const fit = desktop || isName ? 1 : Math.min(1, (window.innerWidth / window.innerHeight) * 0.95);
    const opacity = Number(el.dataset.fieldOpacity ?? 1) * (desktop || isName ? 1 : 0.45);
    return {
      formation: el.dataset.field as Formation,
      color: el.dataset.accent ?? '#c9cfd4',
      x: desktop ? Number(el.dataset.fieldX ?? 0) : 0,
      y: desktop || isName ? 0 : 0.28,
      scale: Number(el.dataset.fieldScale ?? 1) * fit,
      opacity,
      stage,
    };
  };

  let lastAccent = '';
  let lastActive = '';
  const tick = () => {
    const field = getField();
    const mid = window.innerHeight * 0.5;
    const rects = sections.map((el) => el.getBoundingClientRect());
    // Half the depth of the zone around a boundary in which one diorama turns into the next.
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

    // The ambient light follows whichever diorama dominates.
    const leadOuter = t < 0.5 ? sections[a] : sections[b];
    const lead = leadOuter.classList.contains('pin-spacer') ? (leadOuter.firstElementChild as HTMLElement) : leadOuter;
    const accent = lead.dataset.accent ?? '#c9cfd4';
    if (accent !== lastAccent) {
      lastAccent = accent;
      root.style.setProperty('--scene-accent', accent);
      root.style.setProperty('--ambient-x', `${50 + (t < 0.5 ? sa.x : sb.x) * 50}%`);
    }
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

/** Desktop position marker for the project sequence. */
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

// The field lives for the whole visit. three.js is most of the page's script weight, so it loads
// after everything else and fades in; until then the hero's heading waits hidden, and if WebGL is
// unavailable the heading shows instead.
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
      // The CSS start state is no longer needed; dropping it keeps a later revert from hiding the hero.
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

// Web fonts change line lengths, and so every trigger position.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
