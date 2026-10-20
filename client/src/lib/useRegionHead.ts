import { useEffect } from 'react';

/** Region icon set (see public/region-*). Swapped in while a region page is open, put back after. */
const REGION: Record<string, string> = {
  '/favicon.ico': '/region-favicon.ico',
  '/favicon.svg': '/region-favicon.svg',
  '/favicon-32x32.png': '/region-favicon-32x32.png',
  '/favicon-16x16.png': '/region-favicon-16x16.png',
  '/apple-touch-icon.png': '/region-apple-touch-icon.png',
  '/site.webmanifest': '/region.webmanifest',
};

/**
 * Gives region pages their own tab icon, title and colour, also when someone
 * moves there inside the app (the built /region page already has them for a fresh load
 * and for WhatsApp link previews).
 */
export function useRegionHead(title = 'WeekDeck Region') {
  useEffect(() => {
    const undo: (() => void)[] = [];
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      const to = REGION[href];
      if (!to) return;
      link.setAttribute('href', to);
      undo.push(() => link.setAttribute('href', href));
    });
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) {
      const old = theme.content;
      theme.content = '#2747D8';
      undo.push(() => (theme.content = old));
    }
    const oldTitle = document.title;
    document.title = title;
    undo.push(() => (document.title = oldTitle === title ? 'WeekDeck' : oldTitle));
    return () => undo.forEach((f) => f());
  }, [title]);
}
