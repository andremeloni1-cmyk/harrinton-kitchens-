import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { draftTodos } from "@/lib/todo-ai";
import { visionConfigured } from "@/lib/vision";
import type { ChecklistItem } from "@/lib/pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseItems(raw: string): ChecklistItem[] {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .filter((i) => i && typeof i.label === "string")
        .map((i) => ({ label: String(i.label), done: Boolean(i.done) }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function sanitize(body: unknown): ChecklistItem[] {
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => ({ label: String((i as ChecklistItem).label || "").trim(), done: Boolean((i as ChecklistItem).done) }))
    .filter((i) => i.label);
}

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);
  return json({ todos: parseItems(job.todos), aiConfigured: visionConfigured() });
}

/** Save the full todo list. */
export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const body = await req.json().catch(() => ({}));
  const todos = sanitize(body);
  try {
    const job = await prisma.job.update({ where: { id }, data: { todos: JSON.stringify(todos) } });
    return json({ todos: parseItems(job.todos) });
  } catch {
    // Job no longer exists (e.g. deleted while a save was queued offline) — a
    // clean 404 lets the offline queue drop the stale write instead of looping.
    return json({ error: "not found" }, 404);
  }
}

/** Generate todos from the job description with AI, merging without clobbering
 * items the user already ticked or added. */
export async function POST(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);
  if (!visionConfigured()) {
    return json({ error: "AI isn't configured — add ANTHROPIC_API_KEY to generate to-do lists." }, 400);
  }

  const drafted = await draftTodos({ title: job.title, description: job.description, address: job.address });
  if (!drafted) return json({ error: "Couldn't generate a to-do list just now." }, 502);

  // Merge: keep existing items (preserving done state), append new labels only.
  const existing = parseItems(job.todos);
  const seen = new Set(existing.map((i) => i.label.toLowerCase()));
  const merged = [...existing, ...drafted.filter((i) => !seen.has(i.label.toLowerCase()))];

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { todos: JSON.stringify(merged) },
  });
  return json({ todos: parseItems(updated.todos), added: merged.length - existing.length });
}
