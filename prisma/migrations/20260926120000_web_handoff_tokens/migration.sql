-- App → website handoff (2026-09-26): the native app opens a mobile Chat
-- Unlock checkout in the browser, which reads the website's httpOnly session
-- cookie, never the app's bearer token. A single-use, two-minute code carries
-- the member across instead. Hash only, like password_reset_tokens.
--
-- Nothing changes on deploy: a new, empty table.

-- CreateTable
CREATE TABLE "web_handoff_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_handoff_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_handoff_tokens_tokenHash_key" ON "web_handoff_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "web_handoff_tokens_userId_expiresAt_idx" ON "web_handoff_tokens"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "web_handoff_tokens" ADD CONSTRAINT "web_handoff_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
