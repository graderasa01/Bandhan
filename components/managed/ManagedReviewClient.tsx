"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Camera, Check, CheckCheck, Lock, PenLine, ShieldCheck, Sparkles, X,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { CLAIM_TIME_PERMISSIONS, PERMISSION_LABELS } from "@/lib/services/managedProfile/managedProfilePolicy";
import type { ReviewItem, ReviewView } from "@/lib/services/managedProfile/ownerReviewService";
import type { ProfileDelegatePermission } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * The owner's review — the screen that turns somebody else's claims into their
 * own profile, one decision at a time.
 *
 * Three deliberate shapes:
 *
 *  1. **Only what changed.** The owner is never handed the whole sixty-field
 *     form again; they see proposals, and nothing else.
 *  2. **Ordinary facts can go in one tap.** "Confirm all ordinary details"
 *     sends no field list at all — the server picks — so the button
 *     structurally cannot include a sensitive fact however this UI evolves.
 *  3. **Sensitive facts each get their own card and their own button.** They
 *     are visually separated, labelled, and posted one request at a time,
 *     because the server refuses a batch that mixes them.
 */
export default function ManagedReviewClient({ initial }: { initial: ReviewView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [grant, setGrant] = useState(false);
  const [permissions, setPermissions] = useState<ProfileDelegatePermission[]>([
    "VIEW_CONFIRMED_PROFILE",
    "VIEW_REVIEW_STATUS",
  ]);
  const [days, setDays] = useState(90);
  const [familyInviteUrl, setFamilyInviteUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/managed-profile/review/${view.draftId}`);
    if (res.ok) setView((await res.json()) as ReviewView);
  }

  async function decide(fieldKey: string, action: "accept" | "reject" | "replace", value?: string) {
    setBusy(fieldKey);
    setError(null);
    try {
      const res = await fetch(`/api/managed-profile/review/${view.draftId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: [{ fieldKey, action, value }] }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? "Ye faisla save nahi ho paya.");
        return;
      }
      setEditing(null);
      await refresh();
      router.refresh();
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmAllOrdinary() {
    setBusy("bulk");
    setError(null);
    setSkipped([]);
    try {
      const res = await fetch(`/api/managed-profile/review/${view.draftId}/bulk-accept`, { method: "POST" });
      const body = (await res.json()) as { message?: string; skipped?: string[] };
      if (!res.ok) {
        setError(body.message ?? "Confirm nahi ho paya.");
        return;
      }
      // A sweep can legitimately leave a card behind — a value outside its
      // option list is not something a bulk action should quietly force
      // through, and saying so beats the owner wondering why a card stayed.
      setSkipped(body.skipped ?? []);
      await refresh();
      router.refresh();
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    setBusy("finish");
    setError(null);
    try {
      const res = await fetch(`/api/managed-profile/review/${view.draftId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_access: grant,
          permissions: grant ? permissions : [],
          days,
        }),
      });
      const body = (await res.json()) as { message?: string; familyInviteUrl?: string | null };
      if (!res.ok) {
        setError(body.message ?? "Ye step poora nahi ho paya.");
        return;
      }
      setFamilyInviteUrl(body.familyInviteUrl ?? null);
      setDone(true);
      router.refresh();
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
    } finally {
      setBusy(null);
    }
  }

  function togglePermission(p: ProfileDelegatePermission) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <Card variant="trust" padding="lg" className="text-center">
          <ShieldCheck className="mx-auto size-10 text-trust" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold text-ink">Review poora ho gaya</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {view.isLive
              ? "Aapki profile ab live hai. Jo details aapne confirm ki, sirf wahi lagi hain."
              : "Jo details aapne confirm ki, wahi aapki profile par lagi hain. Baaki zaroori baatein bhar kar profile live kar sakte hain."}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            <Link href={view.isLive ? "/user/dashboard" : "/profile/build"}>
              <Button fullWidth>{view.isLive ? "Go to Dashboard" : "Finish My Profile"}</Button>
            </Link>
            <Link href="/user/profile/access">
              <Button variant="secondary" fullWidth>
                Manage Profile Access
              </Button>
            </Link>
          </div>
        </Card>

        {familyInviteUrl && (
          <Card padding="md">
            <p className="text-sm font-semibold text-ink">Family Circle invite</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Ye link unhe bhejiye — isse wo Family Circle me judenge. Wahan bhi chat kabhi nahi dikhti.
            </p>
            <code className="mt-2.5 block truncate rounded-lg border border-line bg-bg-subtle px-3 py-2 font-mono text-xs text-ink">
              {familyInviteUrl}
            </code>
          </Card>
        )}
      </div>
    );
  }

  if (finishing) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <Card variant="luxe" padding="lg">
          <h1 className="text-xl font-semibold text-wine-700">
            {view.helperName} ko aage bhi madad karne dein?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Ye poori tarah aapki marzi hai. Na dein to bhi aapki saari confirm ki hui details aapke paas
            rahengi.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setGrant(false)}
              aria-pressed={!grant}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                !grant ? "border-gold-500 bg-gold-50 dark:bg-gold-900/25" : "border-line bg-surface",
              )}
            >
              <p className="text-sm font-semibold text-ink">Nahi, ab main khud sambhal lunga/lungi</p>
              <p className="mt-1 text-xs text-muted">Unke paas koi access nahi rahega.</p>
            </button>

            <button
              type="button"
              onClick={() => setGrant(true)}
              aria-pressed={grant}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                grant ? "border-gold-500 bg-gold-50 dark:bg-gold-900/25" : "border-line bg-surface",
              )}
            >
              <p className="text-sm font-semibold text-ink">Haan, limited access dijiye</p>
              <p className="mt-1 text-xs text-muted">Expiry ke saath, aur aap kabhi bhi hata sakte hain.</p>
            </button>
          </div>

          {grant && (
            <div className="mt-5 rounded-xl border border-line bg-bg-subtle p-3.5">
              <p className="text-sm font-medium text-ink">Kya-kya kar sakenge</p>
              <div className="mt-2.5 flex flex-col gap-2">
                {CLAIM_TIME_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={permissions.includes(p)}
                      onChange={() => togglePermission(p)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--color-gold-600)]"
                    />
                    <span className="leading-snug text-muted">{PERMISSION_LABELS[p]}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-ink">Kitne din ke liye</p>
                <div className="mt-2 flex gap-2">
                  {[30, 90, 180].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays(d)}
                      aria-pressed={days === d}
                      className={cn(
                        "min-h-12 flex-1 rounded-full border px-3 text-sm font-medium transition-colors",
                        days === d
                          ? "border-transparent bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg"
                          : "border-line-strong bg-surface text-ink",
                      )}
                    >
                      {d} din
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-muted">
                Chat, contact number, documents aur private notes is permission me kabhi shaamil nahi hain.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2.5">
            <Button onClick={finish} loading={busy === "finish"} disabled={grant && permissions.length === 0} fullWidth>
              Finish Review
            </Button>
            <Button variant="ghost" onClick={() => setFinishing(false)} fullWidth>
              Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const renderCard = (item: ReviewItem) => {
    const isEditing = editing === item.fieldKey;
    return (
      <Card key={item.fieldKey} variant={item.sensitive ? "luxe" : "default"} padding="md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{item.label}</p>
            <p className="mt-0.5 text-[0.6875rem] text-muted">{item.contributorLabel}</p>
          </div>
          {item.sensitive && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[0.6875rem] font-medium text-warn">
              <Lock className="size-3" aria-hidden />
              Alag se confirm
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="mt-3">
            {item.options && item.options.length > 0 && item.options.length <= 30 ? (
              <div className="flex flex-wrap gap-1.5">
                {item.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => decide(item.fieldKey, "replace", o)}
                    className="min-h-10 rounded-full border border-line-strong bg-surface px-3 text-sm text-ink transition-colors hover:border-gold-500 hover:bg-gold-50 touch-target dark:hover:bg-gold-900/30"
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : item.type === "textarea" ? (
              <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={3} />
            ) : (
              <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
            )}

            {!(item.options && item.options.length > 0 && item.options.length <= 30) && (
              <div className="mt-2.5 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => decide(item.fieldKey, "replace", editValue)}
                  loading={busy === item.fieldKey}
                  disabled={editValue.trim().length === 0}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="mt-2.5 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-[0.9375rem] text-ink">
              {item.proposedValue}
            </p>
            {item.whyNeeded && <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">{item.whyNeeded}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => decide(item.fieldKey, "accept")}
                loading={busy === item.fieldKey}
                icon={<Check className="size-4" />}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(item.fieldKey);
                  setEditValue(item.proposedValue);
                }}
                icon={<PenLine className="size-4" />}
              >
                Change
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => decide(item.fieldKey, "reject")}
                icon={<X className="size-4" />}
              >
                Reject
              </Button>
            </div>
          </>
        )}
      </Card>
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card variant="luxe" padding="lg">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-wine-700">Aapke liye bhari gayi details</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {view.helperName} ne ye details bhari hain. Aap jo confirm karenge, sirf wahi aapki profile par
              lagega — baaki kahin nahi jaata.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted">
            <span className="font-semibold tabular-nums text-ink">{view.pendingCount}</span> baaki
          </span>
          <span className="text-muted">
            <span className="font-semibold tabular-nums text-ink">{view.decided.length}</span> par faisla ho gaya
          </span>
        </div>
      </Card>

      {error && (
        <Card variant="danger" padding="md">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          </div>
        </Card>
      )}

      {skipped.length > 0 && (
        <Card variant="warning" padding="md">
          <p className="text-sm font-semibold text-ink">Ye khud dekhni padengi</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {skipped.join(", ")} — inki value list me nahi hai, isliye ek saath confirm nahi hui. Neeche
            &ldquo;Change&rdquo; se sahi option chun lijiye.
          </p>
        </Card>
      )}

      {view.ordinaryPending.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Aam details ({view.ordinaryPending.length})</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={confirmAllOrdinary}
              loading={busy === "bulk"}
              icon={<CheckCheck className="size-4" />}
            >
              Confirm All
            </Button>
          </div>
          {view.ordinaryPending.map(renderCard)}
        </>
      )}

      {view.sensitivePending.length > 0 && (
        <>
          <div className="mt-2">
            <h2 className="text-base font-semibold text-ink">Zaroori details ({view.sensitivePending.length})</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Ye ek-ek karke confirm hoti hain — inhe ek saath confirm karne ka option jaan-boojh kar nahi
              rakha gaya.
            </p>
          </div>
          {view.sensitivePending.map(renderCard)}
        </>
      )}

      {view.pendingCount === 0 && (
        <Card variant="trust" padding="lg" className="text-center">
          <ShieldCheck className="mx-auto size-10 text-trust" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Sab details dekh li gayin.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Ab bas ek aakhri sawaal — {view.helperName} ko aage bhi madad karne dena hai ya nahi.
          </p>
        </Card>
      )}

      {view.photosPending && (
        <Card variant="info" padding="md">
          <div className="flex gap-2.5">
            <Camera className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">Photo aapko khud add karni hogi</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Photos aur verification documents koi aur aapki taraf se upload nahi kar sakta — na partner, na
                ghar wale.
              </p>
            </div>
          </div>
        </Card>
      )}

      {view.missingRequiredLabels.length > 0 && (
        <Card variant="warning" padding="md">
          <p className="text-sm font-semibold text-ink">Profile live hone ke liye baaki</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {view.missingRequiredLabels.join(", ")}
          </p>
        </Card>
      )}

      <div className="pb-6">
        <Button onClick={() => setFinishing(true)} fullWidth>
          {view.pendingCount > 0 ? "Finish Later — Set Access" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
