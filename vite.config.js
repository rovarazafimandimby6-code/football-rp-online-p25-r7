import { defineConfig } from 'vite';

const offlineTest = process.env.P27_OFFLINE_TEST === 'true';
const apiBaseUrl = process.env.VITE_P27_API_BASE_URL || 'https://football-rp-online-p25-r7.rovarazafimandimby6.workers.dev';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  },
  define: {
    __P27_OFFLINE_TEST__: JSON.stringify(offlineTest),
    __P27_API_BASE_URL__: JSON.stringify(apiBaseUrl)
  }
});
