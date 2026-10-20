import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The region link (/region) gets its own icon and its own WhatsApp/link preview.
 * WhatsApp doesn't run JavaScript, so it only sees the HTML head: after the build we
 * write a copy of index.html with region tags to dist/region/index.html, and
 * public/_redirects serves it for /region.
 */
function regionHead(): Plugin {
  let outDir = 'dist';
  const swaps: [string, string][] = [
    ['<meta name="theme-color" content="#0E1A2B" />', '<meta name="theme-color" content="#2747D8" />'],
    ['href="/favicon.ico"', 'href="/region-favicon.ico"'],
    ['href="/favicon.svg"', 'href="/region-favicon.svg"'],
    ['href="/favicon-32x32.png"', 'href="/region-favicon-32x32.png"'],
    ['href="/favicon-16x16.png"', 'href="/region-favicon-16x16.png"'],
    ['href="/apple-touch-icon.png"', 'href="/region-apple-touch-icon.png"'],
    ['href="/site.webmanifest"', 'href="/region.webmanifest"'],
    ['<meta name="apple-mobile-web-app-title" content="WeekDeck" />', '<meta name="apple-mobile-web-app-title" content="WD Region" />'],
    ['<meta property="og:title" content="WeekDeck: weekly team slides, done in minutes" />', '<meta property="og:title" content="WeekDeck Region: every team’s week in one view" />'],
    ['<meta name="twitter:title" content="WeekDeck: weekly team slides, done in minutes" />', '<meta name="twitter:title" content="WeekDeck Region: every team’s week in one view" />'],
    ['<meta property="og:description" content="Type the week’s figures. Get professional slides to present, download or share." />', '<meta property="og:description" content="For region heads: every team’s sales, new clients and slides in one place. Log in to your region." />'],
    ['<meta name="twitter:description" content="Type the week’s figures. Get professional slides to present, download or share." />', '<meta name="twitter:description" content="For region heads: every team’s sales, new clients and slides in one place. Log in to your region." />'],
    ['<meta property="og:url" content="https://adronweekdeck.name.ng/" />', '<meta property="og:url" content="https://adronweekdeck.name.ng/region" />'],
    ['<meta property="og:image" content="https://adronweekdeck.name.ng/og-image.png" />', '<meta property="og:image" content="https://adronweekdeck.name.ng/region-og-image.png" />'],
    ['<meta name="twitter:image" content="https://adronweekdeck.name.ng/og-image.png" />', '<meta name="twitter:image" content="https://adronweekdeck.name.ng/region-og-image.png" />'],
    ['<meta property="og:image:alt" content="WeekDeck logo: weekly team slides, done in minutes" />', '<meta property="og:image:alt" content="WeekDeck Region: every team’s week in one view" />'],
    ['<title>WeekDeck</title>', '<title>WeekDeck Region</title>'],
  ];
  return {
    name: 'region-head',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      let html = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const [from, to] of swaps) {
        if (!html.includes(from)) throw new Error(`region-head: "${from}" not found in index.html. Update vite.config.ts to match.`);
        html = html.split(from).join(to);
      }
      mkdirSync(join(outDir, 'region'), { recursive: true });
      writeFileSync(join(outDir, 'region', 'index.html'), html);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), regionHead()],
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
