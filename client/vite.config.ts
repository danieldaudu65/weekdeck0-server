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
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // The PowerPoint builder is big and only needed when downloading.
        manualChunks: { pptx: ['pptxgenjs'], zip: ['jszip'] },
      },
    },
  },
});
