import { motion } from 'motion/react';
import { Check, Shuffle } from 'lucide-react';
import type { DeckSlide } from '../lib/deck';
import { layoutSlide } from '../lib/looks';
import { PALETTES, STYLES, lookById, lookId, type Look } from '../lib/templates';
import { SlideCanvas } from './SlideCanvas';

const SAMPLE: DeckSlide = { kind: 'cover', title: 'Weekly Strategic Session', week: 'Week 2 · 12 – 16 Oct', weekNo: 2, range: '12 – 16 Oct', team: 'Your team', name: 'Team Lead', role: 'Manager', image: '' };

/** Pick a style (layout) and a palette (colours). Each style shows a real mini cover in the chosen colours. */
export function LookPicker({ look, cover, onChange }: { look: Look; cover?: DeckSlide; onChange: (id: string) => void }) {
  const sample = cover ?? SAMPLE;
  const surprise = () => {
    let next = look.id;
    while (next === look.id) next = lookId(STYLES[Math.floor(Math.random() * STYLES.length)].id, PALETTES[Math.floor(Math.random() * PALETTES.length)].id);
    onChange(next);
  };

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-extrabold">
            Style <span className="font-semibold text-muted">· {look.style.name}</span>
          </p>
          <button type="button" onClick={surprise} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-sun-soft px-3 text-xs font-extrabold text-[#7a4f00] active:scale-95">
            <Shuffle className="size-3.5" aria-hidden /> Surprise me
          </button>
        </div>
        {/* Two rows that slide sideways; the page itself never scrolls sideways. */}
        <div className="wd-strip -mx-4 grid snap-x snap-mandatory auto-cols-[10.5rem] grid-flow-col grid-rows-2 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 md:mx-0 md:auto-cols-[12.5rem] md:px-0">
          {STYLES.map((st) => {
            const on = st.id === look.style.id;
            const id = lookId(st.id, look.palette.id);
            const laid = layoutSlide(sample, lookById(id), { teamName: '', page: 1, total: 1 });
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onChange(id)}
                aria-pressed={on}
                className={`relative min-w-0 snap-start rounded-2xl border-2 bg-white p-1.5 text-left transition ${on ? 'border-blue shadow-[0_10px_24px_-14px_rgba(39,71,216,0.9)]' : 'border-transparent hover:border-line'}`}
              >
                <div className="pointer-events-none overflow-hidden rounded-xl ring-1 ring-ink/5">
                  <SlideCanvas bg={laid.bg} shapes={laid.shapes} />
                </div>
                <p className="mt-1.5 px-1 text-sm font-extrabold">{st.name}</p>
                <p className="px-1 pb-1 text-[11px] font-semibold leading-tight text-muted">{st.blurb}</p>
                {on && (
                  <motion.span layoutId="style-check" className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-blue text-white shadow">
                    <Check className="size-4" aria-hidden />
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 px-1 text-sm font-extrabold">
          Colours <span className="font-semibold text-muted">· {look.palette.name}</span>
        </p>
        <div className="wd-strip -mx-4 grid auto-cols-max grid-flow-col grid-rows-2 gap-2.5 overflow-x-auto overscroll-x-contain px-4 py-1.5 md:mx-0 md:px-1">
          {PALETTES.map((p) => {
            const on = p.id === look.palette.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(lookId(look.style.id, p.id))}
                aria-pressed={on}
                aria-label={p.name}
                title={p.name}
                className={`relative grid size-12 place-items-center rounded-full transition active:scale-90 ${on ? 'ring-[3px] ring-blue ring-offset-2' : 'ring-1 ring-line hover:scale-105'}`}
              >
                <span className="absolute inset-1 overflow-hidden rounded-full" style={{ background: `linear-gradient(135deg, #${p.coverBg} 0 50%, #${p.accent} 50% 100%)` }} />
                <span className="relative size-3.5 rounded-full border-2 border-white" style={{ background: `#${p.primary}` }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
