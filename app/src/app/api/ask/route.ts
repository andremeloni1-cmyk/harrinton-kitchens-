import { json } from "@/lib/utils";
import { requirePermission, getSessionUser } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";
import { answerQuestion } from "@/lib/ask-ai";

export const dynamic = "force-dynamic";

// Ask-AI over the role-scoped business snapshot (P12.2). FACTORY/INSTALLER
// snapshots carry no money. The answer is grounded in the snapshot; when AI is
// off we return the snapshot itself so the answer can still be found.
export async function POST(req: Request) {
  const gate = await requirePermission("view");
  if (gate instanceof Response) return gate;
  const user = await getSessionUser();

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) return json({ error: "Ask a question." }, 400);

  const snapshot = await buildSnapshot(user?.role ?? "OFFICE");
  const answer = await answerQuestion(question, snapshot);
  return json({ answer, unavailable: answer === null, snapshot });
}
