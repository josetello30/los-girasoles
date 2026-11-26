# =============================================================================
# Backend Node.js - imagen multi-etapa
#   pruebas    -> incluye Jest y Supertest (make test-api)
#   produccion -> solo dependencias de ejecución, usuario sin privilegios
# =============================================================================
FROM node:22-alpine AS base
WORKDIR /app
ENV TZ=America/Lima
RUN apk add --no-cache tzdata

# ---- Dependencias de ejecución (sin herramientas de desarrollo)
FROM base AS dependencias
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Dependencias completas para las pruebas
FROM base AS pruebas
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY tests ./tests
CMD ["npm", "test"]

# ---- Imagen final que se despliega
FROM base AS produccion
ENV NODE_ENV=production
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Carpeta de imágenes subidas (se monta como volumen); del usuario node para poder escribir
RUN mkdir -p /app/archivos && chown node:node /app/archivos
ENV ARCHIVOS_DIR=/app/archivos
# No se ejecuta como root dentro del contenedor
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
