import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fully static build: no backend, no runtime network calls, no CDN.
export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: { exclude: ['@nagwa-limited/mathlive'] },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
