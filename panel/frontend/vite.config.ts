import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from 'tailwindcss';
const autoprefixer = require('autoprefixer');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    // PostCSS plugins inlined here rather than read from postcss.config.js.
    // The sandboxed build fs intermittently fails to read that small .js
    // file with EIO; loading the plugins explicitly in the vite config skips
    // the on-disk PostCSS config loader entirely.
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../backend/internal/ui/dist'),
    emptyOutDir: true,
    esbuild: {
      logLevel: 'warning',
    },
    // Split vendor libs into their own chunks so no single bundle exceeds
    // the ~500 kB warning threshold and the browser can cache each vendor
    // chunk independently across deploys. react/react-dom and the xterm
    // terminal stack are the biggest contributors; they and the rest of
    // node_modules are pulled into named chunks here rather than landing
    // in one mega "index" file.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xterm')) return 'xterm';
          if (id.includes('react-router')) return 'router';
          // Group all react/react-dom/scheduler under one chunk to avoid
          // Rollup's circular chunk warning ("vendor -> react -> vendor")
          // when the catch-all "vendor" bucket also picks up some react
          // sub-imports. Match by directory segment so react-dom's
          // nested paths don't end up split between two chunks.
          if (
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        secure: false,
        // The terminal page opens a WebSocket against
        // /api/instances/:id/terminal. Without `ws: true` the vite dev
        // proxy ignores the Upgrade handshake and closes the socket
        // cleanly, which the browser reads as an immediate "connection
        // dropped" and our reconnect logic retries every ~1s forever —
        // the panel never even sees the WS request. http-proxy needs the
        // explicit flag to tunnel WS upgrades; the option is a no-op for
        // plain HTTP traffic.
        ws: true,
      },
    },
  },
});
