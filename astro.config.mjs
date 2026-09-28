// @ts-check
import { defineConfig } from 'astro/config';

// Served from https://eirasroger.github.io/roger.verges-portfolio/.
// For a custom domain or a eirasroger.github.io repo, change `site` and drop `base`.
export default defineConfig({
  site: 'https://eirasroger.github.io',
  base: '/roger.verges-portfolio',
  // three.js (the particle field) is one ~530 kB chunk, loaded lazily after the page is up.
  vite: { build: { chunkSizeWarningLimit: 600 } },
});
