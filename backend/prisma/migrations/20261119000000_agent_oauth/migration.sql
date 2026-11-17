CREATE TABLE "AgentAuthorizationCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentAuthorizationCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentAuthorizationCode_codeHash_key" ON "AgentAuthorizationCode"("codeHash");
CREATE INDEX "AgentAuthorizationCode_userId_expiresAt_idx" ON "AgentAuthorizationCode"("userId","expiresAt");
CREATE TABLE "AgentRefreshSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedByHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRefreshSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentRefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentRefreshSession_tokenHash_key" ON "AgentRefreshSession"("tokenHash");
CREATE INDEX "AgentRefreshSession_userId_clientId_expiresAt_idx" ON "AgentRefreshSession"("userId","clientId","expiresAt");
