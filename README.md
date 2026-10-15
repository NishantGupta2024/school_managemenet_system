# School Fee Management System

A multi-tenant School Fee Management platform built from scratch.

## Architecture

- **Backend**: NestJS, TypeScript, Prisma ORM, PostgreSQL 18
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide icons
- **Multi-Tenancy**: Column-level tenant isolation (`schoolId`) managed via Node.js `AsyncLocalStorage` and composite indexing.
- **Database**: PostgreSQL 18 with relational integrity, foreign key cascades, and tenant-scoped uniqueness constraints.

## Project Structure

```
d:\fee/
├── backend/          # NestJS REST API with Prisma ORM
├── frontend/         # React + Vite admin dashboard
├── package.json      # Monorepo workspaces manifest
└── README.md
```

## Quick Start (Phase 1)

### 1. Database Setup
Ensure PostgreSQL is running on port 5432 and the `fee_db` database is accessible.

```bash
# Run migrations & seed baseline data
npm run db:migrate
npm run db:seed
```

### 2. Development

```bash
# Backend (http://localhost:3000)
npm run dev:backend

# Frontend (http://localhost:5173)
npm run dev:frontend
```

### 3. Testing & Verification

```bash
npm run test
npm run build
```
