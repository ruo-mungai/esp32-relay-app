import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any GitHub Pages subpath
  // (/<repo>/) as well as a root user site, without hard-coding a repo name.
  base: "./",
  build: { chunkSizeWarningLimit: 700 },
})
