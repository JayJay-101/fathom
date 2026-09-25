import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    host: true,
    // Mirrors the /media rewrite in vercel.json (same-origin chime fetches).
    proxy: {
      '/media': {
        target: 'https://prana-assets.forestily.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/media/, ''),
      },
    },
  },

  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  },
})