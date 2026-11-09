/** A shared deck (/deck/:shareId): anyone with the link watches it in 3D. No login. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Spinner } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { decksApi } from '../../lib/restyle/api';
import { html3d } from '../../lib/restyle/exports';
import { Present3D } from './DeckEditorPage';

export function SharedDeckPage() {
  const { shareId = '' } = useParams();
  const [html, setHtml] = useState<{ html: string; title: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    decksApi
      .shared(shareId)
      .then(({ deck }) => setHtml({ html: html3d({ ...deck, slides: deck.slides }), title: deck.title }))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'This deck couldn’t be opened.'));
  }, [shareId]);
  if (error)
    return (
      <div className="grid min-h-dvh place-items-center bg-[#05070d] p-6 text-center text-white">
        <p className="max-w-sm text-lg font-bold">{error}</p>
      </div>
    );
  if (!html)
    return (
      <div className="min-h-dvh bg-[#05070d] text-white">
        <Spinner label="Opening the deck…" />
      </div>
    );
  return <Present3D html={html.html} title={html.title} />;
}
