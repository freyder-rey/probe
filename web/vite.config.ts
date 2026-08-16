import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // El server (probe-server) sirve este build desde disco en runtime.
    outDir: '../crates/probe-server/static/dist',
    emptyOutDir: true,
  },
  server: {
    // En dev, Vite sirve la UI y proxya la API al server Rust.
    proxy: {
      '/api': 'http://127.0.0.1:7878',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.tsx',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
  },
})
