-- Store all calendar event ids for a job (one per working day for multi-day jobs).
ALTER TABLE "Job" ADD COLUMN "googleEventIds" TEXT;
