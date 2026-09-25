import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Relative assets keep the build portable under a GitHub Pages repository path.
  base: './',
})
