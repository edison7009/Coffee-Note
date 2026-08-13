import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/src-tauri/**',
        '**/website/**',
        '**/references/**',
        '**/dist/**',
        '**/starter-knowledge/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('@codemirror/lang-markdown') ||
            id.includes('react-markdown') ||
            id.includes('remark-gfm') ||
            id.includes('micromark')
          ) {
            return 'markdown';
          }
          if (id.includes('codemirror') || id.includes('@codemirror')) return 'codemirror';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react';
          return undefined;
        },
      },
    },
  },
});
