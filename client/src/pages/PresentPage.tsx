import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../lib/auth';
import { useDeck } from '../lib/useDeck';
import { mondayOf } from '../lib/weeks';
import { Presenter } from '../components/Presenter';
import { Spinner } from '../components/ui';

/** The team's own deck, full screen. */
export function PresentPage() {
  const { team } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : mondayOf();
  const deck = useDeck({ team, weekStart, includeSummary: params.get('summary') !== '0', includeMap: params.get('map') !== '0' });
  const fromPreview = params.get('back') === 'preview';
  const exit = () => navigate(fromPreview ? `/preview?week=${weekStart}` : `/slides?${params.toString()}`);
  const start = Math.max(0, Number(params.get('from')) || 0);

  if (deck.loading || deck.mapPending)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black text-white">
        <Spinner label="Getting the slides ready…" />
      </div>
    );
  if (deck.error)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black p-6 text-center text-white">
        <div>
          <p className="font-bold">{deck.error}</p>
          <button type="button" onClick={exit} className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
            Back
          </button>
        </div>
      </div>
    );
  return <Presenter slides={deck.laid} title={deck.fileName} onExit={exit} start={start} />;
}
