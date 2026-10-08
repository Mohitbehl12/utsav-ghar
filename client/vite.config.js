import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// `vite build`             → production build served by the Express server (code-split, hashed assets)
// `vite build --mode demo` → single self-contained HTML with an in-browser mock backend (for previews)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  // pdf-lib ships raw U+FFFD characters in strings: emit non-ASCII as \u escapes so the bundle is clean ASCII JS
  esbuild: { charset: 'ascii' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000', '/sitemap.xml': 'http://localhost:4000' },
    fs: { allow: ['..'] },
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    target: 'es2019',
    cssCodeSplit: mode !== 'demo',
    rollupOptions:
      mode === 'demo'
        ? {}
        : { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'] } } },
  },
}));
