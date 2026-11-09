/** A restyled deck, one slide per page, for "Save as PDF" or a printer. */
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { SlideCanvas } from '../../components/SlideCanvas';
import { Button, Spinner } from '../../components/ui';
import { decksApi, type RestyleDeck } from '../../lib/restyle/api';
import { fileBase, laidSlides } from '../../lib/restyle/exports';

export function DeckPrintPage() {
  const { id = '' } = useParams();
  const [deck, setDeck] = useState<RestyleDeck | null>(null);
  const [error, setError] = useState('');
  const printed = useRef(false);
  useEffect(() => {
    decksApi
      .get(id)
      .then((r) => setDeck(r.deck))
      .catch(() => setError('This deck couldn’t be opened.'));
  }, [id]);
  const laid = deck ? laidSlides(deck) : [];
  useEffect(() => {
    if (!deck || printed.current) return;
    printed.current = true;
    document.title = fileBase(deck.title);
    const imgs = Array.from(document.images)
      .filter((i) => !i.complete)
      .map((i) => new Promise((r) => (i.addEventListener('load', r, { once: true }), i.addEventListener('error', r, { once: true }))));
    void Promise.all([document.fonts?.ready, ...imgs]).then(() => setTimeout(() => window.print(), 400));
  }, [deck]);
  return (
    <div className="min-h-dvh bg-[#d9dce4]">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white">
        <Link to={`/decks/${id}`} className="inline-flex items-center gap-1.5 text-sm font-bold">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <p className="hidden text-sm text-white/70 sm:block">Choose “Save as PDF”, landscape, no margins.</p>
        <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()} disabled={!deck}>
          Print / PDF
        </Button>
      </div>
      {error ? (
        <p className="p-10 text-center font-bold">{error}</p>
      ) : !deck ? (
        <Spinner label="Getting your slides ready…" />
      ) : (
        <div className="print-stack mx-auto flex flex-col items-center gap-6 py-6 print:block print:gap-0 print:p-0">
          {laid.map((s, i) => (
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
