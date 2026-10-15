import { useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { History, Lightbulb, MapPin, Repeat } from 'lucide-react';
import { useAutosize } from '../lib/useAutosize';
import { suggest, type Memory, type Suggestion } from '../lib/suggest';
import type { DayKey } from '../lib/types';

const ICON: Record<Suggestion['kind'], typeof History> = { usual: Repeat, memory: History, place: MapPin, idea: Lightbulb };
const TONE: Record<Suggestion['kind'], string> = {
  usual: 'bg-sun-soft text-[#7a4f00] border-sun/40',
  memory: 'bg-white text-ink border-line',
  place: 'bg-blue-soft text-blue border-blue/20',
  idea: 'bg-white text-muted border-dashed border-line',
};

/**
 * A day's activities box that suggests as you type: what the team usually
 * does that day, matching past activities, places after "at", and ideas.
 * Tap a chip (or press Tab for the first one).
 */
export function ActivityInput({ day, label, value, onChange, memory, weekStart }: { day: DayKey; label: string; value: string; onChange: (v: string) => void; memory: Memory; weekStart: string }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<number | undefined>(undefined);
  const list = useMemo(() => (focused ? suggest(memory, { day, text: value, weekStart }) : []), [focused, memory, day, value, weekStart]);

  useAutosize(ref, value);

  const pick = (s: Suggestion) => {
    onChange(s.apply.slice(0, 600));
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      // Keep the cursor at the end and the box where it is on the page.
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 flex items-center justify-between gap-2 text-sm font-bold">
        {label}
        {focused && list.length > 0 && <span className="hidden text-[11px] font-semibold text-muted sm:inline">Tap to use · Tab for the first</span>}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={2}
        maxLength={600}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          window.clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        // A short delay so a tap on a suggestion lands before the list hides.
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setFocused(false), 180);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey && list.length && value.trim()) {
            e.preventDefault();
            pick(list[0]);
          }
        }}
        placeholder="Where will the team market?"
        className="block w-full resize-none overflow-hidden rounded-2xl border border-line bg-white px-4 py-3 text-[15px] leading-6 outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/10"
      />
      <AnimatePresence initial={false}>
        {focused && list.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex flex-wrap gap-2 pt-2" role="listbox" aria-label={`Suggestions for ${label}`}>
              {list.map((s) => {
                const Icon = ICON[s.kind];
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onPointerDown={(e) => e.preventDefault()} // keep the keyboard open and the box focused
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] font-semibold transition active:scale-95 ${TONE[s.kind]}`}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{s.label}</span>
                    <span className="shrink-0 text-[10px] font-bold uppercase opacity-60">{s.note}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
