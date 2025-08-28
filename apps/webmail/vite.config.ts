import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/lib': resolve(__dirname, './src/lib'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/styles': resolve(__dirname, './src/styles'),
      '@/types': resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 3003,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
