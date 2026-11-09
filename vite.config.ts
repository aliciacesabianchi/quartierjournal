import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// DEV_API_PROXY (dev server only): forward /rest/v1 and /auth/v1 to a local API (e.g. the e2e gateway),
// so the app can be previewed from another device through a single origin.
const proxyTarget = process.env.DEV_API_PROXY

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': '/src' } },
  server: proxyTarget ? { proxy: { '/rest/v1': proxyTarget, '/auth/v1': proxyTarget }, allowedHosts: true } : undefined,
  test: { include: ['src/**/*.test.ts'] },
})
