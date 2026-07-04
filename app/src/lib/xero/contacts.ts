import { prisma } from "@/lib/db";
import { xeroGet, xeroPost, XeroApiError } from "@/lib/xero/client";

type XeroContact = { ContactID: string; Name: string; EmailAddress?: string };
type ContactsResponse = { Contacts?: XeroContact[] };

// Xero's `where` filter takes a quoted string literal — escape embedded quotes.
const quote = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

async function findByEmail(email: string): Promise<XeroContact | null> {
  const res = await xeroGet<ContactsResponse>(
    `/Contacts?where=${encodeURIComponent(`EmailAddress==${quote(email)}`)}`
  );
  return res?.Contacts?.[0] ?? null;
}

async function findByName(name: string): Promise<XeroContact | null> {
  const res = await xeroGet<ContactsResponse>(
    `/Contacts?where=${encodeURIComponent(`Name==${quote(name)}`)}`
  );
  return res?.Contacts?.[0] ?? null;
}

/**
 * Resolves (or creates) the Xero contact for a client and persists the link
 * on the Client row. Returns null when Xero is not connected.
 */
export async function findOrCreateContact(client: {
  id: string;
  name: string;
  email?: string | null;
  xeroContactId?: string | null;
}): Promise<string | null> {
  if (client.xeroContactId) return client.xeroContactId;

  let contact: XeroContact | null = null;
  if (client.email) contact = await findByEmail(client.email);
  if (!contact) contact = await findByName(client.name);

  if (!contact) {
    try {
      const res = await xeroPost<ContactsResponse>("/Contacts", {
        Contacts: [
          {
            Name: client.name,
            ...(client.email ? { EmailAddress: client.email } : {}),
          },
        ],
      });
      if (res === null) return null; // Xero not connected
      contact = res.Contacts?.[0] ?? null;
    } catch (e) {
      // Contact names are unique in Xero — someone may have created it with a
      // different email. Fall back to matching by name.
      if (e instanceof XeroApiError && /name.*already exists/i.test(e.message)) {
        contact = await findByName(client.name);
      }
      if (!contact) throw e;
    }
  }

  if (!contact) return null;

  await prisma.client.update({
    where: { id: client.id },
    data: { xeroContactId: contact.ContactID },
  });
  return contact.ContactID;
}
