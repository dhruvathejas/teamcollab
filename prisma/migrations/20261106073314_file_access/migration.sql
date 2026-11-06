-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TeamFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'TEAM',
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamFile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TeamFile" ("createdAt", "id", "mimeType", "name", "size", "storageKey", "teamId", "updatedAt", "uploadedById") SELECT "createdAt", "id", "mimeType", "name", "size", "storageKey", "teamId", "updatedAt", "uploadedById" FROM "TeamFile";
DROP TABLE "TeamFile";
ALTER TABLE "new_TeamFile" RENAME TO "TeamFile";
CREATE UNIQUE INDEX "TeamFile_teamId_name_key" ON "TeamFile"("teamId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
