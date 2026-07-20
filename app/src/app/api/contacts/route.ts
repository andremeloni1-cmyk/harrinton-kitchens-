import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { listContacts, rememberContact } from "@/lib/contacts";

export const dynamic = "force-dynamic";

// Known people (remembered contacts + anyone on a job/client), deduped by
// email/phone — powers the email + phone autosuggest.
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  return json({ contacts: await listContacts() });
}

// Explicitly remember a contact (name/email/phone).
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  await rememberContact({ name: body.name, email: body.email, phone: body.phone });
  return json({ ok: true }, 201);
}
