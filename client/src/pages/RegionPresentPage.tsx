import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { getRegionToken } from '../lib/region';
import { useDeck } from '../lib/useDeck';
import { mondayOf } from '../lib/weeks';
import { Presenter } from '../components/Presenter';
import { Spinner } from '../components/ui';

/** A region head presenting one team's deck (read-only). */
export function RegionPresentPage() {
  const token = getRegionToken();
  const { teamId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : mondayOf();
  const deck = useDeck({ weekStart, includeSummary: true, includeMap: true, remote: token && /^[a-f0-9]{24}$/i.test(teamId) ? { teamId, token } : null });
  const exit = () => navigate(`/region?week=${weekStart}`);

  if (!token) return <Navigate to="/region" replace />;
  if (deck.error)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black p-6 text-center text-white">
        <div>
          <p className="font-bold">{deck.error}</p>
          <button type="button" onClick={exit} className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  if (deck.loading || deck.mapPending)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black text-white">
        <Spinner label="Getting the slides ready…" />
      </div>
    );
  return <Presenter slides={deck.laid} title={deck.fileName} onExit={exit} />;
}
