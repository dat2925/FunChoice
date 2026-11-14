import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: { output: { manualChunks(id) {
      if (/node_modules[\\/]phaser[\\/]/.test(id)) return 'phaser'
    } } },
    chunkSizeWarningLimit: 1600,
  },
})
