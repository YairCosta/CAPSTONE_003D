import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createAiMiddleware, resolveProvider } from './server/aiChat.ts'
import { createRatesMiddleware } from './server/exchangeRates.ts'
import { createAdminMiddleware } from './server/adminUsers.ts'

// API del asistente IA (/api/ai/*): corre en Node dentro del servidor de Vite.
// Las variables sin prefijo VITE_ (GEMINI_API_KEY, OPENAI_API_KEY, GOOGLE_PLACES_API_KEY) nunca llegan al navegador.
function aiAssistantApi(env: Record<string, string>): Plugin {
  const middleware = createAiMiddleware({
    provider: resolveProvider(env),
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    openaiModel: env.OPENAI_MODEL || 'gpt-5-mini',
    placesApiKey: env.GOOGLE_PLACES_API_KEY || undefined,
  })

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
  const middleware = createAdminMiddleware({
    supabaseUrl: env.VITE_SUPABASE_URL || undefined,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || undefined,
    appUrl: env.APP_URL || 'http://localhost:5173',
  })
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
