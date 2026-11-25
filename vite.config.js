import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  },
  define: {
    __P27_OFFLINE_TEST__: 'true'
  }
});
