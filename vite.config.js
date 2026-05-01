import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs'

const createManualChunks = (id) => {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
    return 'react-vendor'
  }

  if (id.includes('/react-router/') || id.includes('/react-router-dom/')) {
    return 'router-vendor'
  }

  if (id.includes('/@supabase/')) {
    return 'supabase-vendor'
  }

  if (
    id.includes('/@radix-ui/') ||
    id.includes('/@headlessui/') ||
    id.includes('/@heroicons/') ||
    id.includes('/lucide-react/') ||
    id.includes('/sonner/') ||
    id.includes('/framer-motion/')
  ) {
    return 'ui-vendor'
  }

  if (
    id.includes('/@mui/') ||
    id.includes('/@emotion/')
  ) {
    return 'mui-vendor'
  }

  if (
    id.includes('/@stripe/react-stripe-js/') ||
    id.includes('/@stripe/stripe-js/') ||
    id.includes('/stripe/')
  ) {
    return 'payments-vendor'
  }

  if (id.includes('/firebase/')) {
    return 'firebase-vendor'
  }

  if (
    id.includes('/jspdf/') ||
    id.includes('/html2canvas/') ||
    id.includes('/jszip/') ||
    id.includes('/file-saver/') ||
    id.includes('/react-to-print/')
  ) {
    return 'documents-vendor'
  }

  if (
    id.includes('/@ffmpeg/')
  ) {
    return 'ffmpeg-vendor'
  }

  if (
    id.includes('/heic2any/') ||
    id.includes('/heic-convert/') ||
    id.includes('/sharp/')
  ) {
    return 'image-conversion-vendor'
  }

  if (
    id.includes('/@reduxjs/') ||
    id.includes('/react-redux/') ||
    id.includes('/redux-persist/') ||
    id.includes('/@tanstack/react-query/')
  ) {
    return 'state-vendor'
  }

  return undefined
}

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })

const createGeminiProxyDevPlugin = (geminiApiKey) => ({
  name: 'gemini-proxy-dev-middleware',
  configureServer(server) {
    server.middlewares.use('/api/gemini-proxy', async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (request.method === 'OPTIONS') {
        response.statusCode = 200
        response.end()
        return
      }

      if (request.method !== 'POST') {
        response.statusCode = 405
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      if (!geminiApiKey) {
        response.statusCode = 500
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }))
        return
      }

      try {
        const rawBody = await readRequestBody(request)
        const {
          action = 'generateContent',
          model = 'gemini-2.5-flash',
          contents,
          generationConfig,
          safetySettings,
        } = JSON.parse(rawBody || '{}')

        const endpoint = action === 'listModels'
          ? `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`
          : `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiApiKey}`

        const upstreamResponse = await fetch(endpoint, {
          method: action === 'listModels' ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(action === 'listModels'
            ? {}
            : {
                body: JSON.stringify({
                  contents,
                  generationConfig,
                  safetySettings,
                }),
              }),
        })

        const responseText = await upstreamResponse.text()
        response.statusCode = upstreamResponse.status
        response.setHeader('Content-Type', 'application/json')
        response.end(responseText)
      } catch (error) {
        response.statusCode = 500
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: error.message || 'Gemini proxy failed' }))
      }
    })
  },
})

const createLocalApiPlugin = () => ({
  name: 'local-api-dev',
  configureServer(server) {
    server.middlewares.use('/api', async (req, res, next) => {
      if (req.url?.startsWith('/gemini-proxy')) return next()

      const applyLocalApiRewrite = (url) => {
        const [rawPath = '', rawQuery = ''] = String(url || '').split('?')
        const normalizedPath = rawPath.replace(/\/$/, '')
        const nextQuery = new URLSearchParams(rawQuery)

        if (normalizedPath === '/admin/users') {
          return `/admin-users${nextQuery.toString() ? `?${nextQuery.toString()}` : ''}`
        }

        if (normalizedPath.startsWith('/admin/users/')) {
          const userId = normalizedPath.slice('/admin/users/'.length)
          if (userId) nextQuery.set('userId', userId)
          return `/admin-users?${nextQuery.toString()}`
        }

        if (normalizedPath === '/me/profile') {
          nextQuery.set('resource', 'profile')
          return `/me?${nextQuery.toString()}`
        }

        if (normalizedPath === '/me/booking-identity') {
          nextQuery.set('resource', 'booking-identity')
          return `/me?${nextQuery.toString()}`
        }

        if (normalizedPath === '/short-links/create') {
          nextQuery.set('action', 'create')
          return `/short-links?${nextQuery.toString()}`
        }

        if (normalizedPath === '/tour-packages') {
          nextQuery.set('resource', 'packages')
          return `/tour-bookings?${nextQuery.toString()}`
        }

        if (normalizedPath === '/tour-tracking') {
          nextQuery.set('resource', 'tracking')
          return `/tour-bookings?${nextQuery.toString()}`
        }

        if (normalizedPath === '/public-catalog') {
          nextQuery.set('resource', 'public-catalog')
          return `/public-links?${nextQuery.toString()}`
        }

        if (normalizedPath === '/public-pricing') {
          nextQuery.set('resource', 'public-pricing')
          return `/public-links?${nextQuery.toString()}`
        }

        if (normalizedPath === '/public-bookings') {
          nextQuery.set('resource', 'public-bookings')
          return `/public-links?${nextQuery.toString()}`
        }

        if (normalizedPath === '/telegram-alerts') {
          nextQuery.set('action', 'telegram-alerts')
          return `/messages?${nextQuery.toString()}`
        }

        if (normalizedPath === '/telegram-overdue-reminders') {
          nextQuery.set('action', 'telegram-overdue-reminders')
          return `/messages?${nextQuery.toString()}`
        }

        if (normalizedPath === '/tenant-audit') {
          nextQuery.set('resource', 'audit')
          return `/tenants?${nextQuery.toString()}`
        }

        if (normalizedPath === '/message-media-maintenance') {
          nextQuery.set('action', 'cleanup-media')
          return `/messages?${nextQuery.toString()}`
        }

        if (normalizedPath === '/document-shares/create') {
          nextQuery.set('action', 'create')
          return `/document-shares?${nextQuery.toString()}`
        }

        if (normalizedPath.startsWith('/document-shares/')) {
          const token = normalizedPath.slice('/document-shares/'.length)
          if (token) nextQuery.set('token', token)
          return `/document-shares?${nextQuery.toString()}`
        }

        if (normalizedPath.startsWith('/short-links/')) {
          const code = normalizedPath.slice('/short-links/'.length)
          if (code) nextQuery.set('code', code)
          return `/short-links?${nextQuery.toString()}`
        }

        if (normalizedPath === '/rentals/audit-log') {
          return `/rental-audit${nextQuery.toString() ? `?${nextQuery.toString()}` : ''}`
        }

        if (normalizedPath.startsWith('/rentals/') && normalizedPath.endsWith('/audit-logs')) {
          const rentalId = normalizedPath.slice('/rentals/'.length, -'/audit-logs'.length)
          if (rentalId) nextQuery.set('rentalId', rentalId)
          return `/rental-audit?${nextQuery.toString()}`
        }

        return `${normalizedPath}${nextQuery.toString() ? `?${nextQuery.toString()}` : ''}`
      }

      const rewrittenUrl = applyLocalApiRewrite(req.url || '')
      const endpoint = (rewrittenUrl.split('?')[0] || '').replace(/\/$/, '')
      const endpointSegments = endpoint.split('/').filter(Boolean)
      const apiRoot = path.resolve(process.cwd(), 'api')

      const resolveApiRoute = (segments) => {
        const exactPath = path.resolve(apiRoot, `${segments.join('/')}.js`)
        if (fs.existsSync(exactPath)) {
          return { apiFilePath: exactPath, routeParams: {} }
        }

        const routeParams = {}
        let currentDir = apiRoot

        for (let i = 0; i < segments.length; i += 1) {
          const segment = segments[i]
          const isLast = i === segments.length - 1

          const exactSegmentPath = path.resolve(currentDir, segment)
          const exactFilePath = path.resolve(currentDir, `${segment}.js`)

          if (isLast && fs.existsSync(exactFilePath)) {
            return { apiFilePath: exactFilePath, routeParams }
          }

          if (fs.existsSync(exactSegmentPath) && fs.statSync(exactSegmentPath).isDirectory()) {
            currentDir = exactSegmentPath
            continue
          }

          const entries = fs.existsSync(currentDir) ? fs.readdirSync(currentDir, { withFileTypes: true }) : []
          const dynamicMatch = entries.find((entry) => {
            if (entry.isDirectory()) {
              return entry.name.startsWith('[') && entry.name.endsWith(']')
            }

            if (isLast && entry.isFile() && entry.name.startsWith('[') && entry.name.endsWith('].js')) {
              return true
            }

            return false
          })

          if (!dynamicMatch) {
            return null
          }

          if (dynamicMatch.isDirectory()) {
            const paramName = dynamicMatch.name.slice(1, -1)
            routeParams[paramName] = segment
            currentDir = path.resolve(currentDir, dynamicMatch.name)
            continue
          }

          const paramName = dynamicMatch.name.slice(1, -4)
          routeParams[paramName] = segment
          return { apiFilePath: path.resolve(currentDir, dynamicMatch.name), routeParams }
        }

        const indexPath = path.resolve(currentDir, 'index.js')
        if (fs.existsSync(indexPath)) {
          return { apiFilePath: indexPath, routeParams }
        }

        return null
      }

      const resolvedRoute = resolveApiRoute(endpointSegments)

      if (!resolvedRoute?.apiFilePath) return next()

      const rawBody = await readRequestBody(req)
      const query = {
        ...Object.fromEntries(new URLSearchParams(rewrittenUrl.split('?')[1] || '')),
        ...resolvedRoute.routeParams,
      }

      const mockReq = {
        method: req.method?.toUpperCase() || 'GET',
        headers: req.headers,
        body: rawBody ? (() => { try { return JSON.parse(rawBody) } catch { return rawBody } })() : {},
        query,
        url: rewrittenUrl,
      }

      let statusCode = 200
      const mockRes = {
        status(code) { statusCode = code; return mockRes },
        setHeader(name, value) { if (!res.headersSent) res.setHeader(name, value); return mockRes },
        end(body = '') {
          if (!res.headersSent) {
            res.statusCode = statusCode
            res.end(body)
          }
        },
        send(body = '') {
          if (!res.headersSent) {
            res.statusCode = statusCode
            if (typeof body === 'object' && body !== null) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
              return
            }
            res.end(String(body))
          }
        },
        json(body) {
          if (!res.headersSent) {
            res.statusCode = statusCode
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
          }
        },
      }

      try {
        const fileUrl = pathToFileURL(resolvedRoute.apiFilePath).href + '?t=' + Date.now()
        const mod = await import(fileUrl)
        await mod.default(mockReq, mockRes)
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      }
    })
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const geminiApiKey = env.GEMINI_API_KEY || ''

  // Expose all .env vars to Node.js process so local API handlers can read them
  Object.assign(process.env, env)

  return {
    plugins: [react(), createGeminiProxyDevPlugin(geminiApiKey), createLocalApiPlugin()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks: createManualChunks,
        },
      },
    },
    base: '/',
    optimizeDeps: {
      include: ['react', 'react-dom']
    }
  }
})
