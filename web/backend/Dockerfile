# Stage 1: build frontend
# Build context must be web/ (not web/backend/)
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend ./
RUN npm run build

# Stage 2: build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Stage 3: production image
FROM node:20-alpine

RUN apk add --no-cache android-tools

WORKDIR /app

ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /frontend/dist ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
