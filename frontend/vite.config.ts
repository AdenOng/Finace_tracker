import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep the legacy CSS pipeline independent of the root Finfolio app.
  css: {
    postcss: { plugins: [] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          charts: ['recharts'],
          forms: ['react-hook-form', 'axios', 'date-fns'],
        },
      },
    },
  },
})
