import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { layoutSlide } from '../../lib/looks';
import { lookById } from '../../lib/templates';
import { getPrintJob } from '../../lib/accounts/printJob';
import { SlideCanvas } from '../../components/SlideCanvas';
import { Button } from '../../components/ui';

/** The chosen slides full size, one per page, for "Save as PDF" or a printer. */
export function AccountsPrintPage() {
  const [job] = useState(getPrintJob);
  const laid = useMemo(() => {
    if (!job) return [];
    const look = lookById(job.lookId);
    return job.slides.map((s, i) => layoutSlide(s, look, { teamName: job.teamName, page: i + 1, total: job.slides.length }));
  }, [job]);
  const printed = useRef(false);

  useEffect(() => {
    if (!job || printed.current || !laid.length) return;
    printed.current = true;
    const old = document.title;
    document.title = job.title;
    Promise.resolve(document.fonts?.ready).then(() => setTimeout(() => window.print(), 300));
    return () => {
      document.title = old;
    };
  }, [job, laid.length]);

  return (
    <div className="min-h-dvh bg-[#d9dce4]">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white">
        <Link to="/accounts/export" className="inline-flex items-center gap-1.5 text-sm font-bold">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <p className="hidden text-sm text-white/70 sm:block">In the print box, choose “Save as PDF”, landscape, no margins.</p>
        <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()} disabled={!laid.length}>
          Print / PDF
        </Button>
      </div>
      {!job ? (
        <p className="p-10 text-center font-bold">
          Nothing to print. <Link to="/accounts/export" className="text-blue">Choose your slides first.</Link>
        </p>
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
