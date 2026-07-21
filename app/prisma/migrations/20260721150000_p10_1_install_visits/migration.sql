-- P10.1: multi-day crewed install visits
ALTER TABLE "SiteVisit" ADD COLUMN "crewIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "SiteVisit" ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 1;
