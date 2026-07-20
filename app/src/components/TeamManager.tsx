"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

type User = { id: string; name: string; email: string; role: Role; active: boolean; createdAt: string };
type Invite = { id: string; email: string; role: Role; expiresAt: string; createdAt: string };

export function TeamManager({ meId }: { meId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("OFFICE");
  const [inviting, setInviting] = useState(false);

  async function load() {
    try {
      const d = await api<{ users: User[]; invites: Invite[] }>("/api/users");
      setUsers(d.users);
      setInvites(d.invites);
    } catch {
      setErr("Couldn't load the team.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setInviting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't send the invite");
      setMsg(
        d.emailed
          ? `Invite emailed to ${email}.`
          : `Invite created for ${email} — email isn't connected, so the link is in the Activity feed to share.`
      );
      setEmail("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send the invite");
    } finally {
      setInviting(false);
    }
  }

  async function patchUser(id: string, data: { role?: Role; active?: boolean }) {
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error || "Update failed");
      return;
    }
    load();
  }

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Team</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">Invite staff and manage their access.</p>
      </header>

      {msg && <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{msg}</p>}
      {err && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{err}</p>}

      {/* Invite */}
      <form onSubmit={sendInvite} className="card mb-5 space-y-3 p-4">
        <h2 className="font-semibold text-stone-900 dark:text-slate-100">Invite someone</h2>
        <input
          className="input"
          type="email"
          inputMode="email"
          placeholder="their@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex gap-2">
          <select className="input flex-1" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button className="btn-primary shrink-0" disabled={inviting || !email}>
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      {/* Members */}
      <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
        Members
      </h2>
      {loading ? (
        <p className="px-1 text-sm text-stone-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isMe = u.id === meId;
            return (
              <div key={u.id} className={`card p-4 ${u.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900 dark:text-slate-100">
                      {u.name} {isMe && <span className="text-xs text-stone-400">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-stone-500 dark:text-slate-400">{u.email}</p>
                    {!u.active && <p className="text-xs font-medium text-red-500">Deactivated</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <select
                      className="input !py-1 !text-sm"
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {!isMe &&
                      (u.active ? (
                        <button
                          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          onClick={() => patchUser(u.id, { active: false })}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          onClick={() => patchUser(u.id, { active: true })}
                        >
                          Reactivate
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-sm font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
            Pending invites
          </h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="card flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-stone-700 dark:text-slate-200">{inv.email}</p>
                  <p className="text-xs text-stone-400 dark:text-slate-500">
                    {ROLE_LABELS[inv.role]} · expires {new Date(inv.expiresAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  Awaiting sign-up
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
