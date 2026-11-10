import { defineConfig } from 'vitest/config';

// base relative : le dossier dist/ fonctionne tel quel (itch.io, GitHub Pages, serveur statique).
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
