import { defineConfig } from 'vite'
import { resolve } from 'node:path' // ✅ Correct import
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tsConfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    manifest: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        studio_main: resolve(__dirname, 'studio.html'),
        wed_cam_main: resolve(__dirname, 'webcam.html'),
      },
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  plugins: [
    react(),
    tsConfigPaths(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: resolve(__dirname, 'electron/preload.ts'), // ✅ Use resolve instead of path.join
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"), // ✅ Use resolve instead of path.resolve
    },
  },
})
