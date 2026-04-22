import { defineConfig } from 'vite'

export default defineConfig({
  root: 'renderer',
  server: {
    port: 4001,
    strictPort: true,
    host: true,
  },
})
