import { gsap } from 'gsap';

/**
 * The closing ring of project cards. It turns slowly on its own; hovering lets it settle
 * with the nearest card facing you, dragging throws it, and it always comes to rest on a card.
 * The card at the front is the chosen one: its links show below the ring.
 */
export function createOrbit(section: HTMLElement, { still = false } = {}) {
  const stageEl = section.querySelector<HTMLElement>('[data-orbit]');
  const ringEl = section.querySelector<HTMLElement>('[data-ring]');
  if (!stageEl || !ringEl) return () => {};
  const stage = stageEl;
  const ring = ringEl;

  const slots = Array.from(ring.querySelectorAll<HTMLElement>('[data-slot]'));
  const cards = Array.from(ring.querySelectorAll<HTMLButtonElement>('[data-card]'));
  // Fade the faces, not the cards: opacity on a 3D parent flattens it and breaks back-face hiding.
  const faces = cards.map((card) => card.querySelector<HTMLElement>('.card-face'));
  const picked = Array.from(section.querySelectorAll<HTMLElement>('[data-picked]'));
  const steps = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-step]'));
  const count = slots.length;
  const step = 360 / count;

  const state = { spin: 0 };
  let radius = 0;
  let chosen = -1;
  let hovering = false;
  let dragging = false;
  let inView = false;
  let settle: gsap.core.Tween | null = null;

  const nearest = (spin: number) => Math.round(spin / step) * step;
  const indexAt = (spin: number) => ((Math.round(-spin / step) % count) + count) % count;

  function layout() {
    const cardWidth = slots[0].offsetWidth;
    radius = cardWidth * (window.innerWidth < 640 ? 1.2 : 1.45);
    slots.forEach((slot, i) => {
      slot.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
    });
  }

  function choose(index: number) {
    if (index === chosen) return;
    chosen = index;
    picked.forEach((el, i) => (el.hidden = i !== index));
    cards.forEach((card, i) => card.setAttribute('aria-current', String(i === index)));
  }

  function render() {
    ring.style.transform = `rotateX(-9deg) rotateY(${state.spin}deg)`;
    cards.forEach((card, i) => {
      const facing = Math.cos(((i * step + state.spin) * Math.PI) / 180);
      const front = Math.max(0, facing);
      // The front card lifts toward you; the ones behind recede into the dark.
      const lift = Math.pow(front, 6);
      card.style.transform = `translateZ(${lift * 60}px) scale(${1 + lift * 0.06})`;
      const face = faces[i];
      if (face) face.style.opacity = String(0.2 + 0.8 * Math.max(0, (facing + 0.35) / 1.35));
    });
    choose(indexAt(state.spin));
  }

  function settleTo(target: number, duration = 1.4) {
    settle?.kill();
    settle = gsap.to(state, { spin: target, duration: still ? 0 : duration, ease: 'power3.out', onUpdate: render });
  }

  function bringToFront(index: number) {
    // Take the short way round.
    const target = -index * step;
    const turns = Math.round((state.spin - target) / 360);
    settleTo(target + turns * 360, 1.1);
  }

  // Idle drift: slow, and it gives way the moment the pointer arrives.
  let drift = 0;
  const tick = (_time: number, delta: number) => {
    if (!inView || still) return;
    const wanted = hovering || dragging ? 0 : -5;
    drift += (wanted - drift) * 0.04;
    if (Math.abs(drift) > 0.01 && !dragging && !settle?.isActive()) {
      state.spin += drift * (delta / 1000);
      render();
    }
  };

  // Drag to throw.
  let startX = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = 0;
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = 0;
    startX = lastX = event.clientX;
    lastT = performance.now();
    velocity = 0;
    settle?.kill();
  };
  const onMove = (event: PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = event.clientX - lastX;
    moved = Math.max(moved, Math.abs(event.clientX - startX));
    // Capture only once it is really a drag, so a plain click still lands on the card.
    if (moved > 6 && !stage.hasPointerCapture(event.pointerId)) stage.setPointerCapture(event.pointerId);
    state.spin += dx * 0.28;
    velocity = (dx * 0.28) / Math.max(1, now - lastT);
    lastX = event.clientX;
    lastT = now;
    render();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    // Momentum carries on, then the nearest card is pulled to the front.
    settleTo(nearest(state.spin + velocity * 380), 1.6);
  };
  const onClick = (event: MouseEvent) => {
    const card = (event.target as Element).closest<HTMLButtonElement>('[data-card]');
    if (!card || moved > 6) return;
    const index = Number(card.dataset.card);
    if (index === chosen) {
      picked[index].querySelector<HTMLAnchorElement>('a')?.click();
    } else {
      bringToFront(index);
    }
  };
  const onFocus = (event: FocusEvent) => {
    const card = (event.target as Element).closest<HTMLButtonElement>('[data-card]');
    if (card) bringToFront(Number(card.dataset.card));
  };
  const onEnter = () => {
    hovering = true;
    if (!dragging) settleTo(nearest(state.spin), 1.8);
  };
  const onLeave = () => {
    hovering = false;
  };
  const onStep = (event: MouseEvent) => {
    const dir = Number((event.currentTarget as HTMLElement).dataset.step);
    settleTo(nearest(state.spin) - dir * step, 1);
  };

  const observer = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting), { threshold: 0.1 });
  observer.observe(stage);

  layout();
  render();
  window.addEventListener('resize', layout);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('pointerenter', onEnter);
  stage.addEventListener('pointerleave', onLeave);
  ring.addEventListener('click', onClick);
  ring.addEventListener('focusin', onFocus);
  steps.forEach((b) => b.addEventListener('click', onStep));
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    settle?.kill();
    observer.disconnect();
    window.removeEventListener('resize', layout);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onUp);
    stage.removeEventListener('pointerenter', onEnter);
    stage.removeEventListener('pointerleave', onLeave);
    ring.removeEventListener('click', onClick);
    ring.removeEventListener('focusin', onFocus);
    steps.forEach((b) => b.removeEventListener('click', onStep));
  };
}
