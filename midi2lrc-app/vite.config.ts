import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Midi2LRC/',
  plugins: [react()],
  build: {
    outDir: 'docs',
  },
})
