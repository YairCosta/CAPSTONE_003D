import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createAiMiddleware } from './server/aiChat.ts'
import { createRatesMiddleware } from './server/exchangeRates.ts'
import { createAdminMiddleware } from './server/adminUsers.ts'
import { adminConfigFrom, aiConfigFrom } from './server/api.ts'

// La API (/api/*) corre en Node dentro del servidor de Vite; publicada, en una función de Vercel
// (server/vercel.ts). La configuración sale de las mismas variables en los dos casos (server/api.ts).

// API del asistente IA (/api/ai/*). Las variables sin prefijo VITE_ nunca llegan al navegador.
function aiAssistantApi(env: Record<string, string>): Plugin {
  const middleware = createAiMiddleware(aiConfigFrom(env))

  return {
    name: 'revela-ai-assistant-api',
    configureServer(server) {
      server.middlewares.use('/api/ai', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', middleware)
    },
  }
}

// Tipos de cambio (/api/rates): Banco Central de Chile para CLP y open.er-api para el resto
function exchangeRatesApi(): Plugin {
  const middleware = createRatesMiddleware()
  return {
    name: 'revela-exchange-rates-api',
    configureServer(server) {
      server.middlewares.use('/api/rates', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/rates', middleware)
    },
  }
}

// Invitaciones de usuarios (/api/admin/*). La clave secreta de Supabase (SUPABASE_SERVICE_ROLE_KEY)
// salta RLS: por eso vive solo en el servidor, sin prefijo VITE_, y nunca llega al navegador.
function adminUsersApi(env: Record<string, string>): Plugin {
  const middleware = createAdminMiddleware(adminConfigFrom(env))
  return {
    name: 'revela-admin-users-api',
    configureServer(server) {
      server.middlewares.use('/api/admin', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/admin', middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), aiAssistantApi(env), exchangeRatesApi(), adminUsersApi(env)],
  }
})
