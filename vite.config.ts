import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createAiMiddleware } from './server/aiChat.ts'
import { createRatesMiddleware } from './server/exchangeRates.ts'

// API del asistente IA (/api/ai/*): corre en Node dentro del servidor de Vite.
// Las variables sin prefijo VITE_ (GEMINI_API_KEY, GOOGLE_PLACES_API_KEY) nunca llegan al navegador.
function aiAssistantApi(env: Record<string, string>): Plugin {
  const middleware = createAiMiddleware({
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), aiAssistantApi(env), exchangeRatesApi()],
  }
})
