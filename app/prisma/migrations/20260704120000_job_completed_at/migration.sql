-- Real completion time (updatedAt is unreliable — any edit bumps it).
ALTER TABLE "Job" ADD COLUMN "completedAt" DATETIME;
-- Backfill existing completed jobs with their last-updated time as a best guess.
UPDATE "Job" SET "completedAt" = "updatedAt" WHERE "status" = 'completed';
