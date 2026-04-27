-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "createdById" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_organizationId_idx" ON "issue"("organizationId");

-- CreateIndex
CREATE INDEX "issue_createdById_idx" ON "issue"("createdById");

-- CreateIndex
CREATE INDEX "issue_assignedToId_idx" ON "issue"("assignedToId");

-- CreateIndex
CREATE INDEX "issue_status_idx" ON "issue"("status");

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
