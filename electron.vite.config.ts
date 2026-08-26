import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // node-pty and chokidar are native/CJS: they must be required at
        // runtime rather than bundled into the main chunk.
        external: ['@lydell/node-pty', 'chokidar'],
        input: {
          index: resolve(__dirname, 'main.ts')
        }
      }
    }
  },

  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'preload.ts')
        }
      }
    }
  },

  renderer: {
    root: '.',

    plugins: [
      react(),
      tailwindcss()
    ],

    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    }
  }
})