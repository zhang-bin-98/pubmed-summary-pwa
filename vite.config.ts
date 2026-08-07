import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const base = process.env.GITHUB_ACTIONS === 'true' && repository
  ? repository.toLowerCase() === `${owner}.github.io`.toLowerCase() ? '/' : `/${repository}/`
  : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'PubMed 综述',
        short_name: 'PubMed综述',
        description: '在浏览器中检索 PubMed 并生成中文医学综述',
        lang: 'zh-CN',
        start_url: '.',
        display: 'standalone',
        background_color: '#f6f8f7',
        theme_color: '#176b5b',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    restoreMocks: true,
  },
});
