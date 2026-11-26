import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths, safe under both the production domain and Pages preview URLs
  plugins: [], // Cloudflare's deploy step injects its own plugin here automatically
  build: { outDir: 'dist' },
});
