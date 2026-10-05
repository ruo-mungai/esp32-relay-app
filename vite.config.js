import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any GitHub Pages subpath
  // (/<repo>/) as well as a root user site, without hard-coding a repo name.
  base: './',
  build: { chunkSizeWarningLimit: 700 },
  server: {
    // The full-stack backend runs on :4000. Proxy API/auth traffic there
    // so the dev server and API share one origin (no CORS juggling).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
