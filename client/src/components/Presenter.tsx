import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Shrink, X } from 'lucide-react';
import type { Shape } from '../lib/deck';
import { SlideCanvas } from './SlideCanvas';

/**
 * Full-screen slideshow: arrow keys / space / tap the sides / swipe to move,
 * F for full screen, Esc to leave. Each slide animates in (numbers count up,
 * bars grow). Works on a laptop, a phone, or a TV through the laptop.
 */
export function Presenter({ slides, title, onExit }: { slides: { bg: string; shapes: Shape[] }[]; title: string; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [full, setFull] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = slides.length;

  const go = useCallback((to: number) => setI(Math.max(0, Math.min(n - 1, to))), [n]);
  const wake = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2500);
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        go(i + 1);
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      } else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(n - 1);
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else if (e.key === 'Escape' && !document.fullscreenElement) onExit();
      wake();
    };
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [i, n, go, onExit, toggleFull, wake]);

  useEffect(() => {
    wake();
    const prev = document.title;
    document.title = `${title} · Present`;
    return () => {
      document.title = prev;
      window.clearTimeout(hideTimer.current);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slide = slides[i];
  return (
    <div
      className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black"
      onMouseMove={wake}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        wake();
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1));
      }}
    >
      {/* The slide, as big as the screen allows at 16:9 */}
      <div className="relative" style={{ width: 'min(100vw, calc(100dvh * 16 / 9))' }}>
        {slide && <SlideCanvas key={i} bg={slide.bg} shapes={slide.shapes} animate label={`Slide ${i + 1} of ${n}`} />}
        {/* Tap the left or right side to move */}
        <button type="button" aria-label="Previous slide" className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize" onClick={() => go(i - 1)} />
        <button type="button" aria-label="Next slide" className="absolute inset-y-0 right-0 w-3/4 cursor-e-resize" onClick={() => go(i + 1)} />
      </div>

      {/* Progress */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
        <div className="h-full bg-white/70 transition-all duration-500" style={{ width: `${((i + 1) / Math.max(1, n)) * 100}%` }} />
      </div>

      {/* Controls fade away while presenting */}
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${chrome ? 'opacity-100' : 'opacity-0'}`}>
        <div className="pointer-events-auto absolute right-3 top-3 flex gap-2">
          <button type="button" onClick={toggleFull} className="grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25" aria-label={full ? 'Leave full screen' : 'Full screen'}>
            {full ? <Shrink className="size-5" aria-hidden /> : <Expand className="size-5" aria-hidden />}
          </button>
          <button type="button" onClick={onExit} className="grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25" aria-label="Stop presenting">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 p-1 text-white backdrop-blur">
          <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="grid size-10 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30" aria-label="Previous slide">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <span className="figures min-w-14 text-center text-sm font-bold" aria-live="polite">
            {i + 1} / {n}
          </span>
          <button type="button" onClick={() => go(i + 1)} disabled={i === n - 1} className="grid size-10 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30" aria-label="Next slide">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
        <p className="absolute left-4 top-4 hidden text-xs font-semibold text-white/50 md:block">← → or tap to move · F full screen · Esc to leave</p>
      </div>
    </div>
  );
}
