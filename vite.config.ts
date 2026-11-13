import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Base path: set VITE_BASE_PATH=/REPOSITORY-NAME/ for GitHub Pages project sites.
// Default './' (relative) works at root, in sub-paths and with HashRouter.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH && env.VITE_BASE_PATH !== '/' ? env.VITE_BASE_PATH : './'
  return {
    base,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 1500,
    },
  }
})

