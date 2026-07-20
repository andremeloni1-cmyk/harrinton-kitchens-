import { prisma } from "@/lib/db";

export type ContactDTO = { name: string | null; email: string | null; phone: string | null };

/**
 * Remember a person entered on a job/invoice so they can be suggested later.
 * Deduped by email when present, otherwise by phone. Never stores a blank
 * contact, and never clobbers an existing name/phone with a blank.
 */
export async function rememberContact(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<void> {
  const name = input.name?.trim() || null;
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) return; // nothing worth remembering

  try {
    if (email) {
      const existing = await prisma.contact.findUnique({ where: { email } });
      if (existing) {
        await prisma.contact.update({
          where: { email },
          data: { name: name || existing.name, phone: phone || existing.phone },
        });
      } else {
        await prisma.contact.create({ data: { name, email, phone } });
      }
      return;
    }
    // Phone-only: dedupe on phone by hand (no unique index on phone).
    const existing = await prisma.contact.findFirst({ where: { phone } });
    if (existing) {
      await prisma.contact.update({ where: { id: existing.id }, data: { name: name || existing.name } });
    } else {
      await prisma.contact.create({ data: { name, phone } });
    }
  } catch {
    /* best-effort — a race on the unique email just means it already exists */
  }
}

/**
 * The merged contact list for autosuggest: the remembered Contact table plus
 * anyone already on a job or client (so existing data shows without a backfill),
 * deduped by email then phone.
 */
export async function listContacts(): Promise<ContactDTO[]> {
  const [contacts, jobs, clients] = await Promise.all([
    prisma.contact.findMany({ orderBy: { updatedAt: "desc" }, take: 500 }),
    prisma.job.findMany({
      where: { OR: [{ clientEmail: { not: null } }, { clientPhone: { not: null } }] },
      select: { clientName: true, clientEmail: true, clientPhone: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.client.findMany({
      where: { OR: [{ email: { not: null } }, { phone: { not: null } }] },
      select: { name: true, email: true, phone: true },
    }),
  ]);

  const out: ContactDTO[] = [];
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const add = (name: string | null, email: string | null, phone: string | null) => {
    const e = email?.trim() || null;
    const p = phone?.trim() || null;
    if (!e && !p) return;
    const ek = e?.toLowerCase();
    const pk = p?.replace(/\s+/g, "");
    if ((ek && seenEmail.has(ek)) || (!ek && pk && seenPhone.has(pk))) return;
    if (ek) seenEmail.add(ek);
    if (pk) seenPhone.add(pk);
    out.push({ name: name?.trim() || null, email: e, phone: p });
  };

  for (const c of contacts) add(c.name, c.email, c.phone);
  for (const c of clients) add(c.name, c.email, c.phone);
  for (const j of jobs) add(j.clientName, j.clientEmail, j.clientPhone);

  return out.slice(0, 300);
}
