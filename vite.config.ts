import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      manifest: {
        name: 'Ratón Ingeniero',
        short_name: 'Ratón Ingeniero',
        description: 'Aprende torsión jugando: un ratón ingeniero en un mundo 3D.',
        lang: 'es',
        start_url: '.',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#1b2430',
        theme_color: '#1b2430',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: { include: ['tests/unit/**/*.test.ts'] },
});
