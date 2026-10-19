import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
