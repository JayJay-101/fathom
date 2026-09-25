import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Minus, Pointer, X } from 'lucide-react';

// First-run guided tour: a welcome card, then a pointing finger that taps
// each control in turn with a short tip, then a "what works when" summary.
//
// Targets are found by `data-tour="<id>"` attributes, so the tour never
// reaches into component internals. Positions are re-measured on resize and
// scroll, and the tip flips above or below the target and is clamped to the
// viewport, which is what makes the same steps work on phone and desktop.

type When = 'before' | 'anytime';

interface Step {
  target: string;
  title: string;
  body: (verb: string) => string;
  when: When;
}

const STEPS: Step[] = [
  {
    target: 'visual',
    title: 'Pick a visual',
    body: v => `${v} Aurora or Geo to choose the background that breathes with you.`,
    when: 'before',
  },
  {
    target: 'patterns',
    title: 'Choose a rhythm',
    body: v => `Each pattern is a different breath. ${v} one to see what it's for and how long it lasts.`,
    when: 'before',
  },
  {
    target: 'audio-mode',
    title: 'Earphones or speaker',
    body: () => 'Earphones play a binaural bed, the speaker plays an isochronic one. Pick before you start: it locks for the session.',
    when: 'before',
  },
  {
    target: 'bed-mute',
    title: 'Background sound',
    body: () => 'Mutes or unmutes the ambient sound bed. The breath timing is unaffected.',
    when: 'anytime',
  },
  {
    target: 'chimes',
    title: 'Chime bell',
    body: () => 'Turns the chime on each breath change on or off. Useful with eyes closed.',
    when: 'anytime',
  },
  {
    target: 'night',
    title: 'Night mode',
    body: () => 'Switches to the darker night visuals. It follows the time of day until you change it.',
    when: 'anytime',
  },
  {
    target: 'fullscreen',
    title: 'Fullscreen',
    body: () => 'Hides the browser around the app for fewer distractions.',
    when: 'anytime',
  },
  {
    target: 'achievements',
    title: 'Achievements',
    body: () => 'Your streaks, milestones and badges live here. It is also where you export or import your history, since it is stored only on this device.',
    when: 'before',
  },
  {
    target: 'start',
    title: 'Begin',
    body: v => `${v} Enter Session when you're ready. During a session, ${v.toLowerCase()} anywhere to show or hide the controls.`,
    when: 'before',
  },
];

const MATRIX: { label: string; before: boolean; during: boolean; note?: string }[] = [
  { label: 'Visual & rhythm',     before: true, during: false },
  { label: 'Earphones / speaker', before: true, during: false, note: 'locked' },
  { label: 'Background sound',    before: true, during: true },
  { label: 'Chime bell',          before: true, during: true },
  { label: 'Night mode',          before: true, during: true },
  { label: 'Fullscreen',          before: true, during: true },
  { label: 'Achievements',        before: true, during: false },
];

const GUTTER = 16;
const TIP_WIDTH = 300;
const SPOT_PAD = 8;

interface TourProps {
  onClose: () => void;
}

export const Tour: React.FC<TourProps> = ({ onClose }) => {
  // -1 = welcome card, STEPS.length = summary card.
  const [index, setIndex] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipHeight, setTipHeight] = useState(180);

  // Measured after render so placement uses the tip's real height.
  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight;
    if (h && Math.abs(h - tipHeight) > 1) setTipHeight(h);
  });

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const verb = isTouch ? 'Tap' : 'Click';

  const step = index >= 0 && index < STEPS.length ? STEPS[index] : null;

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    if (!step) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Bring the target on screen (the start panel scrolls on short phones),
  // then measure once the scroll has settled.
  useLayoutEffect(() => {
    if (!step) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    const t = window.setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const next = () => (index >= STEPS.length ? onClose() : setIndex(i => i + 1));
  const back = () => setIndex(i => Math.max(-1, i - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Layout ────────────────────────────────────────────────────────────────
  const tipWidth = Math.min(TIP_WIDTH, viewport.w - GUTTER * 2);
  let tipStyle: React.CSSProperties = {};
  let fingerStyle: React.CSSProperties = {};
  let placeBelow = true;

  if (rect) {
    const spaceBelow = viewport.h - rect.bottom;
    placeBelow = spaceBelow > tipHeight + 80 || spaceBelow > rect.top;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centerX - tipWidth / 2, GUTTER), viewport.w - tipWidth - GUTTER);
    const wanted = placeBelow
      ? rect.bottom + SPOT_PAD + 56
      : rect.top - SPOT_PAD - 56 - tipHeight;
    // Tall targets (the rhythm list on a phone) leave no room either side;
    // keep the tip fully on screen even if it overlaps the target's edge.
    const top = Math.min(Math.max(wanted, GUTTER), viewport.h - tipHeight - GUTTER);
    tipStyle = { left, top, width: tipWidth };
    fingerStyle = placeBelow
      ? { left: centerX - 14, top: rect.bottom + SPOT_PAD + 6 }
      : { left: centerX - 14, top: rect.top - SPOT_PAD - 46 };
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  // ── Welcome / summary cards ───────────────────────────────────────────────
  if (!step) {
    const isWelcome = index < 0;
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 animate-in fade-in duration-300"
        onClick={stop}
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-sm glass-panel border border-white/10 rounded-2xl p-6 sm:p-8 text-white/80 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white" type="button" aria-label="Close tutorial">
            <X size={18} />
          </button>

          {isWelcome ? (
            <>
              <p className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/70 mb-3">Welcome</p>
              <h2 className="text-xl font-light text-white mb-3">Welcome to Fathom</h2>
              <p className="text-sm text-white/60 leading-relaxed mb-6">
                A guided breathing space. Pick a rhythm, follow the count, and let the
                visuals and chimes pace your breath. Here's a 30-second tour of the controls.
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} type="button" className="flex-1 py-3 rounded-full border border-white/10 text-xs tracking-[0.2em] uppercase text-white/40 hover:text-white">
                  Skip
                </button>
                <button onClick={next} type="button" className="flex-1 py-3 rounded-full bg-white text-black text-xs tracking-[0.2em] uppercase hover:bg-white/90">
                  Show me
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/70 mb-3">Quick reference</p>
              <h2 className="text-lg font-light text-white mb-4">What works when</h2>
              <table className="w-full text-xs mb-6">
                <thead>
                  <tr className="text-[9px] tracking-[0.2em] uppercase text-white/30">
                    <th className="text-left font-normal pb-2" />
                    <th className="font-normal pb-2 w-16">Before</th>
                    <th className="font-normal pb-2 w-16">During</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map(row => (
                    <tr key={row.label} className="border-t border-white/5">
                      <td className="py-2 text-white/70">{row.label}</td>
                      <td className="py-2 text-center"><Mark ok={row.before} /></td>
                      <td className="py-2 text-center">
                        <Mark ok={row.during} />
                        {row.note && <span className="block text-[8px] uppercase tracking-widest text-white/25">{row.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-white/40 mb-5">You can replay this tour from the ⓘ button.</p>
              <div className="flex gap-3">
                <button onClick={back} type="button" className="flex-1 py-3 rounded-full border border-white/10 text-xs tracking-[0.2em] uppercase text-white/40 hover:text-white">
                  Back
                </button>
                <button onClick={onClose} type="button" className="flex-1 py-3 rounded-full bg-white text-black text-xs tracking-[0.2em] uppercase hover:bg-white/90">
                  Got it
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Pointer step ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100]" onClick={stop} role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Click-catcher so the app underneath isn't operated mid-tour. */}
      <div className="absolute inset-0" />

      {/* Spotlight: a transparent hole whose huge shadow dims everything else. */}
      {rect && (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-300 ease-out"
          style={{
            left: rect.left - SPOT_PAD,
            top: rect.top - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 1px rgba(103,232,249,0.5), 0 0 24px rgba(103,232,249,0.35)',
          }}
        >
          <span className="absolute inset-0 rounded-2xl border border-cyan-300/60 tour-ripple" />
        </div>
      )}

      {/* Tip */}
      <div
        ref={tipRef}
        className="absolute glass-panel border border-white/10 rounded-2xl p-5 text-white/80 transition-all duration-300 ease-out"
        style={rect ? tipStyle : { left: GUTTER, right: GUTTER, bottom: GUTTER * 2 }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 rounded-full border ${
            step.when === 'before' ? 'border-amber-300/30 text-amber-200/80' : 'border-emerald-300/30 text-emerald-200/80'
          }`}>
            {step.when === 'before' ? 'Before session' : 'Anytime'}
          </span>
          <span className="text-[10px] text-white/30 tabular-nums">{index + 1} / {STEPS.length}</span>
        </div>
        <h3 className="text-base font-light text-white mb-1">{step.title}</h3>
        <p className="text-sm text-white/60 leading-relaxed mb-4">{step.body(verb)}</p>
        <div className="flex items-center gap-2">
          <button onClick={onClose} type="button" className="text-[10px] tracking-[0.2em] uppercase text-white/30 hover:text-white mr-auto">
            Skip
          </button>
          <button onClick={back} type="button" className="px-4 py-2 rounded-full border border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/50 hover:text-white">
            Back
          </button>
          <button onClick={next} type="button" className="px-5 py-2 rounded-full bg-white text-black text-[10px] tracking-[0.2em] uppercase hover:bg-white/90">
            Next
          </button>
        </div>
      </div>
      {/* The finger, tapping toward the target. */}
      {rect && (
        <div className="absolute pointer-events-none transition-all duration-300 ease-out" style={fingerStyle}>
          <Pointer
            size={34}
            strokeWidth={1.5}
            className={`text-white drop-shadow-[0_0_10px_rgba(103,232,249,0.8)] tour-tap ${placeBelow ? '' : 'rotate-180'}`}
            fill="rgba(255,255,255,0.15)"
          />
        </div>
      )}

    </div>
  );
};

const Mark = ({ ok }: { ok: boolean }) =>
  ok
    ? <Check size={14} className="inline text-emerald-300" aria-label="yes" />
    : <Minus size={14} className="inline text-white/20" aria-label="no" />;
