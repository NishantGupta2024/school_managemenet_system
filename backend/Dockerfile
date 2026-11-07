# ==============================================================================
# STAGE 1: Dependency Installation & Compilation
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install native dependencies required for build if necessary (dumb-init, etc.)
RUN apk add --no-cache dumb-init

# Copy root monorepo files for npm workspaces resolution
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all dependencies (including devDependencies required for nest build & prisma)
RUN npm ci --workspace=backend --include-workspace-root

# Copy backend source code and Prisma schema
COPY backend/tsconfig*.json ./backend/
COPY backend/nest-cli.json ./backend/
COPY backend/prisma ./backend/prisma
COPY backend/src ./backend/src

# Generate Prisma Client
RUN npm run prisma:generate --workspace=backend

# Compile TypeScript / NestJS application to ./backend/dist
RUN npm run build --workspace=backend

# Prune development dependencies to keep only production packages
RUN npm prune --omit=dev --workspace=backend --include-workspace-root

# ==============================================================================
# STAGE 2: Lightweight Production Runtime
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

# Security, Signal Handling & Database Backup Tooling:
# - dumb-init forwards SIGTERM/SIGINT properly to Node.js
# - postgresql-client provides pg_dump and pg_restore for automated encrypted backups
RUN apk add --no-cache dumb-init postgresql-client

ENV NODE_ENV=production
ENV PORT=3000

# Create unprivileged system user and group, and initialize writable backup & storage directories
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /var/backups/fee_database \
             /usr/src/app/storage/receipt-templates \
             /usr/src/app/storage/receipt-artifacts \
             /usr/src/app/storage/examination-question-images && \
    chown -R appuser:appgroup /var/backups/fee_database /usr/src/app/storage && \
    chmod -R 0750 /var/backups/fee_database /usr/src/app/storage

# Copy production node_modules from builder (npm workspaces hoists to root node_modules)
COPY --from=builder --chown=appuser:appgroup /usr/src/app/node_modules ./node_modules

# Copy Prisma schema and engines
COPY --from=builder --chown=appuser:appgroup /usr/src/app/backend/prisma ./backend/prisma

# Copy compiled NestJS dist
COPY --from=builder --chown=appuser:appgroup /usr/src/app/backend/dist ./backend/dist

# Copy backend package.json for runtime metadata
COPY --from=builder --chown=appuser:appgroup /usr/src/app/backend/package.json ./backend/package.json

# Switch to unprivileged non-root user
USER appuser

EXPOSE 3000

# Define container entrypoint using dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Launch compiled application
CMD ["node", "backend/dist/main.js"]
