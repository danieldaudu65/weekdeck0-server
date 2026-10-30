import { useEffect } from 'react';

/** Icon sets in public/: region-* for /region, accounts-* for /accounts. */
const icons = (prefix: string, manifest: string): Record<string, string> => ({
  '/favicon.ico': `/${prefix}-favicon.ico`,
  '/favicon.svg': `/${prefix}-favicon.svg`,
  '/favicon-32x32.png': `/${prefix}-favicon-32x32.png`,
  '/favicon-16x16.png': `/${prefix}-favicon-16x16.png`,
  '/apple-touch-icon.png': `/${prefix}-apple-touch-icon.png`,
  '/site.webmanifest': manifest,
});
const REGION = icons('region', '/region.webmanifest');
const ACCOUNTS = icons('accounts', '/accounts.webmanifest');

/**
 * Gives a section its own tab icon, title and colour while it's open, also when
 * someone moves there inside the app, and puts the WeekDeck ones back after.
 * (The built /region and /accounts pages already have them for a fresh load and
 * for WhatsApp link previews: see vite.config.ts.)
 */
function usePageHead(swap: Record<string, string>, theme: string, title: string) {
  useEffect(() => {
    const undo: (() => void)[] = [];
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      const to = swap[href];
      if (!to) return;
      link.setAttribute('href', to);
      undo.push(() => link.setAttribute('href', href));
    });
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      const old = meta.content;
      meta.content = theme;
      undo.push(() => (meta.content = old));
    }
    const oldTitle = document.title;
    document.title = title;
    undo.push(() => (document.title = oldTitle === title ? 'WeekDeck' : oldTitle));
    return () => undo.forEach((f) => f());
  }, [swap, theme, title]);
}

export const useRegionHead = (title = 'WeekDeck Region') => usePageHead(REGION, '#2747D8', title);
export const useAccountsHead = (title = 'WeekDeck Accounts') => usePageHead(ACCOUNTS, '#0E7A4B', title);
