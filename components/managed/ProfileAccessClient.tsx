"use client";

import { useState } from "react";
import { Building2, CalendarClock, History, ShieldCheck, ShieldOff, SlidersHorizontal, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  GRANTABLE_PERMISSIONS,
  PERMISSION_LABELS,
} from "@/lib/services/managedProfile/managedProfilePolicy";
import type { DelegationView } from "@/lib/services/managedProfile/delegationService";
import type { ConsentHistoryRow } from "@/lib/services/managedProfile/consentLog";
import type { ProfileDelegatePermission } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * "Kaun meri profile dekh sakta hai" — one screen, and the only place a grant
 * can be ended.
 *
 * Revoke is a single tap with no second dialog beyond a confirm, because the
 * asymmetry matters: granting access should take deliberation, ending it
 * should not. The consent history underneath is the owner's own record and is
 * never shown to a helper.
 */
export default function ProfileAccessClient({
  initialDelegations,
  history,
}: {
  initialDelegations: DelegationView[];
  history: ConsentHistoryRow[];
}) {
  const [delegations, setDelegations] = useState(initialDelegations);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [scope, setScope] = useState<ProfileDelegatePermission[]>([]);

  async function saveScope(id: string) {
    setBusy(`s-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/profile/access/${id}/scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: scope }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? "Permission update nahi hui.");
        return;
      }
      setDelegations((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, permissions: scope, permissionLabels: scope.map((p) => PERMISSION_LABELS[p]) }
            : d,
        ),
      );
      setEditing(null);
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/profile/access/${id}/revoke`, { method: "POST" });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? "Access hataya nahi ja saka.");
        return;
      }
      setDelegations((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "REVOKED" as const, live: false, revokedAt: new Date().toISOString() } : d)),
      );
      setConfirming(null);
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
    } finally {
      setBusy(null);
    }
  }

  const live = delegations.filter((d) => d.live);
  const past = delegations.filter((d) => !d.live);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h1 className="text-2xl font-bold text-wine-700">Profile Access</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Jinhe aapne apni profile me madad karne ki permission di hai. Chat, contact number, documents aur
          private notes kisi permission me shaamil nahi hain.
        </p>
      </section>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      {live.length === 0 ? (
        <Card variant="trust" padding="lg" className="text-center">
          <ShieldCheck className="mx-auto size-10 text-trust" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Abhi kisi ke paas access nahi hai.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Aapki profile poori tarah aapke control me hai.
          </p>
        </Card>
      ) : (
        live.map((d) => (
          <Card key={d.id} variant="luxe" padding="lg">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                {d.helperKind === "PARTNER" ? <Building2 className="size-5" /> : <Users className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{d.helperName}</p>
                <p className="text-xs text-muted">
                  {d.helperKind === "PARTNER" ? "Verified partner" : "Family member"}
                </p>

                <ul className="mt-3 flex flex-col gap-1.5">
                  {d.permissionLabels.map((label) => (
                    <li key={label} className="flex items-start gap-2 text-sm leading-snug text-muted">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden />
                    {d.daysLeft !== null ? `${d.daysLeft} din baaki` : "Koi expiry nahi"}
                  </span>
                  <span>Di gayi: {new Date(d.grantedAt).toLocaleDateString("en-IN")}</span>
                </div>
              </div>
            </div>

            {/* Phase 3 — the Client Desk permissions are granted here rather
                than at claim time: "search on my behalf" is a decision an
                owner makes after working with a partner, not in the same
                breath as claiming their own profile. */}
            {editing === d.id ? (
              <div className="mt-4 rounded-lg border border-line bg-bg-subtle p-3.5">
                <p className="text-sm font-medium text-ink">Ye partner kya kar sakte hain</p>
                <div className="mt-2.5 flex flex-col gap-2">
                  {GRANTABLE_PERMISSIONS.map((p) => (
                    <label key={p} className="flex items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={scope.includes(p)}
                        onChange={() =>
                          setScope((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
                        }
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-gold-600)]"
                      />
                      <span className="leading-snug text-muted">{PERMISSION_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
                  Search ki permission dene par har search aapki history me likhi jayegi — neeche dikhegi.
                  Chat, number aur documents kisi bhi permission me shaamil nahi hain.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" loading={busy === `s-${d.id}`} disabled={scope.length === 0} onClick={() => saveScope(d.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {editing !== d.id && confirming !== d.id && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(d.id);
                    setScope(d.permissions);
                  }}
                  icon={<SlidersHorizontal className="size-4" />}
                >
                  Change What They Can Do
                </Button>
              )}
            </div>

            <div className="mt-2">
              {confirming === d.id ? (
                <div className="rounded-lg border border-danger/25 bg-danger-bg p-3">
                  <p className="text-sm text-ink">
                    {d.helperName} ka access abhi hata dein? Aapki saari confirm ki hui details aapke paas hi
                    rahengi.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="danger" onClick={() => revoke(d.id)} loading={busy === d.id}>
                      Yes, Revoke
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirming(d.id)}
                  icon={<ShieldOff className="size-4" />}
                >
                  Revoke Access
                </Button>
              )}
            </div>
          </Card>
        ))
      )}

      {past.length > 0 && (
        <Card padding="lg">
          <h2 className="text-base font-semibold text-ink">Purane access</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {past.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-muted">{d.helperName}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
                    d.status === "REVOKED"
                      ? "border-danger/25 bg-danger-bg text-danger"
                      : "border-line bg-bg-subtle text-muted",
                  )}
                >
                  {d.status === "REVOKED" ? "Hataya gaya" : "Expire ho gaya"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="lg">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <History className="size-4 text-gold-600" aria-hidden />
          Consent history
        </h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Abhi koi record nahi hai.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-ink">
                  {h.text}
                  {h.fieldLabel && <span className="text-muted"> — {h.fieldLabel}</span>}
                  {h.detail && <span className="text-muted"> ({h.detail})</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
