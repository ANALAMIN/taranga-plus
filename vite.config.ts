import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Plain Vite config for Tauri. Replaces electron.vite.config.ts.
// Tauri's dev server is served by Vite at the port declared in tauri.conf.json
// (devUrl). The renderer-only build output (dist/) is what Tauri bundles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri expects the dev server on a fixed port. 1420 is Tauri's conventional
  // default; it must match tauri.conf.json -> build.devUrl.
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
});
