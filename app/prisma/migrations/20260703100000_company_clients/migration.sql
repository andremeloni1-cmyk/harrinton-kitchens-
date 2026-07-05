-- Companies are the clients: link jobs to their client company (LeadSource)
-- and give lead sources a pretty display name. Additive ADD COLUMNs only.
ALTER TABLE "Job" ADD COLUMN "companyId" TEXT;
ALTER TABLE "LeadSource" ADD COLUMN "displayName" TEXT;
