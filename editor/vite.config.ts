import { defineConfig } from 'vite';
import { resolve } from 'path';

// basicSsl is optional — only loaded when VITE_HTTPS=1 so the normal dev/test
// path has no dependency on the plugin at runtime.
const httpsPlugins = process.env['VITE_HTTPS'] === '1'
  ? [(await import('@vitejs/plugin-basic-ssl')).default()]
  : [];

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: httpsPlugins,
  server: {
    // Bind only to loopback in plain-HTTP mode so we never accidentally expose
    // crypto.subtle-less HTTP to a network interface.
    host: process.env['VITE_HTTPS'] === '1' ? '0.0.0.0' : 'localhost',
  },
  preview: {
    host: process.env['VITE_HTTPS'] === '1' ? '0.0.0.0' : 'localhost',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 1024 * 1024 * 10,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@samizdat': resolve(__dirname, '../src'),
    },
  },
  esbuild: {
    target: 'es2022',
  },
});
