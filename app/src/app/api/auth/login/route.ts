import { json } from "@/lib/utils";
import { checkPassword, setSessionCookie, clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!checkPassword(body.password || "")) {
    return json({ error: "Incorrect password" }, 401);
  }
  await setSessionCookie();
  return json({ ok: true });
}

export async function DELETE() {
  await clearSessionCookie();
  return json({ ok: true });
}
