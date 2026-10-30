import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The region link (/region) and the accounts link (/accounts) get their own icon
 * and their own WhatsApp/link preview. WhatsApp doesn't run JavaScript, so it only
 * sees the HTML head: after the build we write a copy of index.html with that
 * section's tags to dist/<section>/index.html, and public/_redirects serves it.
 */
const BASE_DESC = 'Type the week’s figures. Get professional slides to present, download or share.';
const BASE_TITLE = 'WeekDeck: weekly team slides, done in minutes';

function headSwaps(o: { prefix: string; path: string; theme: string; short: string; title: string; ogTitle: string; desc: string }): [string, string][] {
  return [
    ['<meta name="theme-color" content="#0E1A2B" />', `<meta name="theme-color" content="${o.theme}" />`],
    ['href="/favicon.ico"', `href="/${o.prefix}-favicon.ico"`],
    ['href="/favicon.svg"', `href="/${o.prefix}-favicon.svg"`],
    ['href="/favicon-32x32.png"', `href="/${o.prefix}-favicon-32x32.png"`],
    ['href="/favicon-16x16.png"', `href="/${o.prefix}-favicon-16x16.png"`],
    ['href="/apple-touch-icon.png"', `href="/${o.prefix}-apple-touch-icon.png"`],
    ['href="/site.webmanifest"', `href="/${o.prefix}.webmanifest"`],
    ['<meta name="apple-mobile-web-app-title" content="WeekDeck" />', `<meta name="apple-mobile-web-app-title" content="${o.short}" />`],
    [`<meta property="og:title" content="${BASE_TITLE}" />`, `<meta property="og:title" content="${o.ogTitle}" />`],
    [`<meta name="twitter:title" content="${BASE_TITLE}" />`, `<meta name="twitter:title" content="${o.ogTitle}" />`],
    [`<meta property="og:description" content="${BASE_DESC}" />`, `<meta property="og:description" content="${o.desc}" />`],
    [`<meta name="twitter:description" content="${BASE_DESC}" />`, `<meta name="twitter:description" content="${o.desc}" />`],
    ['<meta property="og:url" content="https://adronweekdeck.name.ng/" />', `<meta property="og:url" content="https://adronweekdeck.name.ng/${o.path}" />`],
    ['<meta property="og:image" content="https://adronweekdeck.name.ng/og-image.png" />', `<meta property="og:image" content="https://adronweekdeck.name.ng/${o.prefix}-og-image.png" />`],
    ['<meta name="twitter:image" content="https://adronweekdeck.name.ng/og-image.png" />', `<meta name="twitter:image" content="https://adronweekdeck.name.ng/${o.prefix}-og-image.png" />`],
    ['<meta property="og:image:alt" content="WeekDeck logo: weekly team slides, done in minutes" />', `<meta property="og:image:alt" content="${o.ogTitle}" />`],
    ['<title>WeekDeck</title>', `<title>${o.title}</title>`],
  ];
}

const SECTIONS: { dir: string; swaps: [string, string][] }[] = [
  {
    dir: 'region',
    swaps: headSwaps({
      prefix: 'region', path: 'region', theme: '#2747D8', short: 'WD Region', title: 'WeekDeck Region',
      ogTitle: 'WeekDeck Region: every team’s week in one view',
      desc: 'For region heads: every team’s sales, new clients and slides in one place. Log in to your region.',
    }),
  },
  {
    dir: 'accounts',
    swaps: headSwaps({
      prefix: 'accounts', path: 'accounts', theme: '#0E7A4B', short: 'WD Accounts', title: 'WeekDeck Accounts',
      ogTitle: 'WeekDeck Accounts: payments, marketers and monthly slides',
      desc: 'For accountants: your region’s payment sheets, marketers and monthly slides in one place.',
    }),
  },
];

function sectionHeads(): Plugin {
  let outDir = 'dist';
  return {
    name: 'section-heads',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      const base = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const { dir, swaps } of SECTIONS) {
        let html = base;
        for (const [from, to] of swaps) {
          if (!html.includes(from)) throw new Error(`section-heads (${dir}): "${from}" not found in index.html. Update vite.config.ts to match.`);
          html = html.split(from).join(to);
        }
        mkdirSync(join(outDir, dir), { recursive: true });
        writeFileSync(join(outDir, dir, 'index.html'), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sectionHeads()],
  server: {
    port: 5173,
    // Local development: the website forwards /api to the Express server.
    proxy: { '/api': 'http://localhost:4100' },
  },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: {
    // es2022: the PDF reader (pdf.js) uses top-level await. Every modern phone browser supports it.
    target: 'es2022',
    rollupOptions: {
      output: {
        // The PowerPoint builder is big and only needed when downloading.
        manualChunks: { pptx: ['pptxgenjs'], zip: ['jszip'] },
      },
    },
  },
});
