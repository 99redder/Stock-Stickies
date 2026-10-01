import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    assetsDir: 'static',
    manifest: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // Two pages: the app, and the iPad board served at /ipad.
      input: { index: 'index.html', ipad: 'ipad.html' },
    },
  },
})
