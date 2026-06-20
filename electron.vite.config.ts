import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = process.cwd();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: resolve(root, 'src-electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: {
          index: resolve(root, 'src-electron/preload/index.ts')
        },
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: root,
    build: {
      outDir: resolve(root, 'dist'),
      rollupOptions: {
        input: {
          index: resolve(root, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': root
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
