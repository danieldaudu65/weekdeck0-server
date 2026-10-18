import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDeck } from '../lib/useDeck';
import { mondayOf } from '../lib/weeks';
import { SlideCanvas } from '../components/SlideCanvas';
import { Button, Spinner } from '../components/ui';

/** Full-size slides, one per page, for "Save as PDF" or a real printer. */
export function PrintPage() {
  const { team } = useAuth();
  const [params] = useSearchParams();
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : mondayOf();
  const deck = useDeck({ team, weekStart, includeSummary: params.get('summary') !== '0', includeMap: params.get('map') !== '0' });
  const printed = useRef(false);

  useEffect(() => {
    document.title = deck.fileName;
    if (deck.loading || deck.mapPending || deck.error || printed.current || !deck.laid.length) return;
    printed.current = true;
    // Wait for fonts and pictures so the PDF isn't missing anything.
    const imgs = Array.from(document.images)
      .filter((i) => !i.complete)
      .map(
        (i) =>
          new Promise((r) => {
            i.addEventListener('load', r, { once: true });
            i.addEventListener('error', r, { once: true });
          }),
      );
    Promise.all([document.fonts?.ready, ...imgs]).then(() => setTimeout(() => window.print(), 300));
  }, [deck.loading, deck.mapPending, deck.error, deck.laid.length, deck.fileName]);

  return (
    <div className="min-h-dvh bg-[#d9dce4]">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white">
        <Link to={`/slides?${params.toString()}`} className="inline-flex items-center gap-1.5 text-sm font-bold">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <p className="hidden text-sm text-white/70 sm:block">In the print box, choose “Save as PDF”, landscape, no margins.</p>
        <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()} disabled={deck.loading}>
          Print / PDF
        </Button>
      </div>
      {deck.loading ? (
        <Spinner label="Getting your slides ready…" />
      ) : deck.error ? (
        <p className="p-10 text-center font-bold">{deck.error}</p>
      ) : (
        <div className="print-stack mx-auto flex flex-col items-center gap-6 py-6 print:block print:gap-0 print:p-0">
          {deck.laid.map((s, i) => (
            <div key={i} className="print-slide w-full max-w-[1100px] px-4 print:max-w-none print:px-0">
              <div className="shadow-xl print:hidden">
                <SlideCanvas bg={s.bg} shapes={s.shapes} label={`Slide ${i + 1}`} />
              </div>
              <div className="hidden print:block">
                <SlideCanvas bg={s.bg} shapes={s.shapes} fixed />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
