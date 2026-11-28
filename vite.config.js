import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
// `npm run build`            → normal multi-file build for Netlify / Vercel
// `npm run build:standalone` → one self-contained HTML file (dist-standalone/index.html)
//                              that opens by double-click, no server needed (demo mode)
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone'
  return {
    base: standalone ? './' : '/',
    plugins: standalone ? [vue(), viteSingleFile()] : [vue()],
    define: { __HASH_ROUTER__: JSON.stringify(standalone) },
    build: standalone ? { outDir: 'dist-standalone', chunkSizeWarningLimit: 4000 } : {},
  }
})
