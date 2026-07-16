import { defineConfig } from 'vite'

/** Default :4010 (4001 reserved for tools-jinqing). Override with PORT. */
const port = Number(process.env.PORT || 4010)

export default defineConfig({
  root: 'renderer',
  server: {
    port,
    strictPort: true,
    host: true,
  },
})
