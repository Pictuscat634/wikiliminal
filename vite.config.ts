import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths, safe under both the production domain and Pages preview URLs
  build: { outDir: 'dist' },
});
