# ==============================================================================
# STAGE 1: Frontend Build Stage
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy root monorepo files for npm workspaces resolution
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install frontend dependencies
RUN npm ci --workspace=frontend --include-workspace-root

# Copy frontend source files, static public assets, and configuration
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/index.html ./frontend/
COPY frontend/postcss.config.js ./frontend/
COPY frontend/tailwind.config.js ./frontend/
COPY frontend/public ./frontend/public
COPY frontend/src ./frontend/src

# Optional: pass build-time API base URL if needed (defaults to relative /api/v1)
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Compile TypeScript and bundle production static assets to ./frontend/dist
RUN npm run build --workspace=frontend

# ==============================================================================
# STAGE 2: Lightweight Production Web Server
# ==============================================================================
# Uses static web server (serve) on Node 22 Alpine, or Nginx in Stage C
FROM node:22-alpine AS runner

WORKDIR /app

# Install lightweight, unprivileged static file server
RUN npm install -g serve && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy compiled static assets from builder
COPY --from=builder --chown=appuser:appgroup /usr/src/app/frontend/dist ./dist

# Switch to non-root user
USER appuser

EXPOSE 8080

# Serve SPA static assets with fallback to index.html for client-side routing
CMD ["serve", "-s", "dist", "-l", "8080"]
