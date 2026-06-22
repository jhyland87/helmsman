import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// Multi-context MV3 build: the popup (index.html) and options page
// (options.html) are HTML entries; the background service worker is a
// standalone module entry emitted at a stable path so manifest.json can
// reference it. The moonraker-client is consumed from its TypeScript source
// (live edits, no separate build step); its only Node dependency —
// `node:events` — is aliased to the browser-safe `events` package.
export default defineConfig({
  plugins: [
    react(),
    analyzer({
      enabled: false
    })
  ],
  resolve: {
    alias: {
      '@': here('./src'),
      '@jhyland87/moonraker-client': here('./modules/moonraker-client/src/index.ts'),
      'node:events': 'events',
    },
  },
  server: {
    fs: { allow: [here('.'), here('./modules/moonraker-client')] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false // Forces the build to ignore implied side effects
      },
      input: {
        popup: here('./index.html'),
        options: here('./options.html'),
        background: here('./src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Name third-party code explicitly; otherwise the shared chunk gets
        // named after an arbitrary first-party module it contains (which made
        // the React+MUI+Recharts bundle masquerade as "PrinterSelector").
        // The Recharts dependency family is deliberately left unassigned so it
        // follows the lazy-loaded TemperaturePanel into its own async chunk
        // instead of bloating the eagerly-parsed vendor bundle.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          const lazyChart =
            /node_modules\/(recharts|victory-vendor|d3-[^/]+|decimal\.js-light|@reduxjs|immer|react-redux|es-toolkit|reselect|use-sync-external-store)\//.test(
              id,
            );
          return lazyChart ? undefined : 'vendor';
        },
      },
    },
  },
});
