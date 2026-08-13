import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

function firebaseConfigFallbackPlugin(): Plugin {
  return {
    name: 'firebase-config-fallback',
    resolveId(id: string) {
      if (id.endsWith('firebase-applet-config.json')) {
        return '\0firebase-applet-config.json';
      }
    },
    load(id: string) {
      if (id === '\0firebase-applet-config.json') {
        const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          try {
            return fs.readFileSync(configPath, 'utf-8');
          } catch (e) {
            console.error('Failed to read firebase-applet-config.json from disk:', e);
          }
        }
        return JSON.stringify({
          apiKey: "",
          authDomain: "",
          projectId: "",
          storageBucket: "",
          messagingSenderId: "",
          appId: "",
          firestoreDatabaseId: ""
        });
      }
    }
  };
}

export default defineConfig(() => {
  return {
    test: {
      environment: 'jsdom',
      globals: true,
    },
    plugins: [react(), tailwindcss(), firebaseConfigFallbackPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
