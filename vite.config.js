import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, 'shared') } },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Συμβατότητα και με παλαιότερα iPhone (Safari 14+)
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900, target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'] },
});
