# Imagen de Revela: compila la aplicación y la sirve junto con su API en un solo proceso de Node.
# Construir y levantar:  docker compose up --build   (ver README.md)

# ---------------------------------------------------------------- 1. Compilación
FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Las variables VITE_* quedan dentro de la aplicación al compilarla. Sin ellas se compila la demo:
# datos de ejemplo en memoria, sin base de datos ni claves.
ARG VITE_DATA_SOURCE=demo
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---------------------------------------------------------------- 2. Ejecución (solo lo necesario para correr)
FROM node:22-alpine AS ejecucion
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=compilacion /app/dist ./dist
# El servidor de la API importa algunas reglas compartidas de src/
COPY server ./server
COPY src ./src
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/ai/status >/dev/null || exit 1
CMD ["node", "--experimental-strip-types", "--no-warnings", "server/docker.ts"]
