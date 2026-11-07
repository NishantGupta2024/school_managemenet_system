-- Migration: Add User Sessions, Password Reset Tokens, Auth Audit Logs, and Account Lockout Fields
-- Target: PostgreSQL
-- Safety: Additive columns and new tables only. Zero column deletions or drops.

-- 1. Alter User table (mapped to "users") to add lockout, password change timestamp, and last login tracking
ALTER TABLE "users" 
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- 2. Create user_sessions table
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT,
  "tokenFamily" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "deviceInfo" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_sessions_userId_isRevoked_idx" ON "user_sessions"("userId", "isRevoked");
CREATE INDEX IF NOT EXISTS "user_sessions_tokenFamily_idx" ON "user_sessions"("tokenFamily");
CREATE INDEX IF NOT EXISTS "user_sessions_refreshTokenHash_idx" ON "user_sessions"("refreshTokenHash");

-- 3. Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_expiresAt_idx" ON "password_reset_tokens"("userId", "expiresAt");

-- 4. Create auth_audit_logs table
CREATE TABLE IF NOT EXISTS "auth_audit_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "schoolId" TEXT,
  "email" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "auth_audit_logs_email_createdAt_idx" ON "auth_audit_logs"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "auth_audit_logs_schoolId_createdAt_idx" ON "auth_audit_logs"("schoolId", "createdAt");
