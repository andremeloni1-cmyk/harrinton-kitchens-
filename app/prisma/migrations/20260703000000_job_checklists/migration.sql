-- Per-job checklists: work to-do list and return-trip maintenance list.
-- Additive ADD COLUMNs (safe on the live SQLite DB — no table rebuild).
ALTER TABLE "Job" ADD COLUMN "todos" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Job" ADD COLUMN "maintenanceTasks" TEXT NOT NULL DEFAULT '[]';
