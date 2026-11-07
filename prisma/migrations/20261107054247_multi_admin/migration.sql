-- CreateTable
CREATE TABLE "SiteAdmin" (
    "userId" TEXT NOT NULL,
    "canAddAdmins" BOOLEAN NOT NULL DEFAULT false,
    "suspendable" BOOLEAN NOT NULL DEFAULT true,
    "bannable" BOOLEAN NOT NULL DEFAULT true,
    "deletable" BOOLEAN NOT NULL DEFAULT true,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteAdmin_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "SiteAdmin_addedById_idx" ON "SiteAdmin"("addedById");

-- AddForeignKey
ALTER TABLE "SiteAdmin" ADD CONSTRAINT "SiteAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAdmin" ADD CONSTRAINT "SiteAdmin_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
