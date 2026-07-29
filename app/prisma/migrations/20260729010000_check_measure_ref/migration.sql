-- The check measure gets its own human reference (CM-1042), so a dimension,
-- a power point or a photo can be cross-referenced long after the job is done.
-- Positional sub-refs (CM-1042-R2-P1) are derived in lib/measure-ref.ts and are
-- deliberately not stored — only the measure's own reference is.
ALTER TABLE "CheckMeasure" ADD COLUMN "ref" TEXT;
ALTER TABLE "CheckMeasure" ADD COLUMN "measuredByName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CheckMeasure" ADD COLUMN "measuredAt" DATETIME;

-- Backfill from the job reference so existing measures read as a pair with
-- their job: JOB-1042 is measured by CM-1042. References that don't end in a
-- number are left null and get one the next time the measure is saved.
UPDATE "CheckMeasure"
SET "ref" = 'CM-' || (
  SELECT replace("Job"."reference", 'JOB-', '')
  FROM "Job"
  WHERE "Job"."id" = "CheckMeasure"."jobId"
)
WHERE EXISTS (
  SELECT 1 FROM "Job"
  WHERE "Job"."id" = "CheckMeasure"."jobId" AND "Job"."reference" LIKE 'JOB-%'
);

-- Unique, but nullable: SQLite allows many NULLs in a unique index, so the
-- un-backfilled rows above don't collide with each other.
CREATE UNIQUE INDEX "CheckMeasure_ref_key" ON "CheckMeasure"("ref");
