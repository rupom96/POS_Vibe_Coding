import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const useHttps = process.env.VITE_HTTPS !== '0' && mode !== 'http'
  const hubTarget = useHttps
    ? (process.env.VITE_API_PROXY ?? 'https://localhost:5081')
    : (process.env.VITE_API_PROXY ?? 'http://localhost:5080')

  const hubProxy = {
    '/hubs': {
      target: hubTarget,
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  }

  return {
    plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5179,
    strictPort: true,
    proxy: hubProxy,
  },
  preview: {
    host: true,
    port: 5179,
    strictPort: true,
    proxy: hubProxy,
  },
  }
})
