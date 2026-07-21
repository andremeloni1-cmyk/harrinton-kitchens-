-- P3.1: add the pipeline-stage spine to Job, and backfill it from the legacy
-- `status` lifecycle so existing jobs land on the correct stage. `status` is
-- kept mirrored from `pipelineStage` on every write until P3.3 retires it.

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "pipelineStage" TEXT NOT NULL DEFAULT 'ENQUIRY';

-- Backfill from the six legacy statuses (see lib/pipeline.ts stageForLegacyStatus).
-- scheduled + in_progress both collapse onto INSTALL; unknown values keep the
-- ENQUIRY default.
UPDATE "Job" SET "pipelineStage" = CASE "status"
  WHEN 'lead'        THEN 'ENQUIRY'
  WHEN 'accepted'    THEN 'DEPOSIT'
  WHEN 'scheduled'   THEN 'INSTALL'
  WHEN 'in_progress' THEN 'INSTALL'
  WHEN 'completed'   THEN 'HANDOVER'
  WHEN 'cancelled'   THEN 'CANCELLED'
  ELSE 'ENQUIRY'
END;
