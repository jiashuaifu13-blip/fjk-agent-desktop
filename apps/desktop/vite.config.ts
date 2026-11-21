import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const packagesDir = fileURLToPath(new URL('../../packages', import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fjk/agent-state': packagesDir + '/agent-state',
      '@fjk/gateway-client': packagesDir + '/gateway-client',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Allow importing the shared packages/agent-state from outside the app root.
      allow: [root, packagesDir],
    },
    watch: {
      // Don't watch the Rust build output — cargo churns and locks these files,
      // which crashes Vite's file watcher with EBUSY.
      ignored: ['**/src-tauri/**'],
    },
  },
  clearScreen: false,
})
