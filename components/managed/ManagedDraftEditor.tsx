"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Check, Copy, Link2, Lock, PenLine, RefreshCw, ShieldOff, Trash2, WifiOff,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SmartProfileDeck from "@/components/profile/SmartProfileDeck";
import { ManagedProfileDraftProvider, type ManagedSaveState } from "@/lib/profile/managedDraftState";
import {
  DRAFT_STATUS_HINT,
  DRAFT_STATUS_LABEL,
  MANAGED_DRAFT_FIELD_KEYS,
} from "@/lib/services/managedProfile/managedProfilePolicy";
import type { DraftSummary } from "@/lib/services/managedProfile/managedDraftService";
import type { ConsentHistoryRow } from "@/lib/services/managedProfile/consentLog";
import { cn } from "@/lib/utils";

interface Props {
  draft: DraftSummary;
  history: ConsentHistoryRow[];
  canWriteValues: boolean;
  canManageClaimLink: boolean;
  accessRevoked: boolean;
  backHref: string;
  subjectWord: string;
}

const SAVE_COPY: Record<ManagedSaveState, { text: string; tone: string } | null> = {
  idle: null,
  saving: { text: "Save ho raha hai…", tone: "text-muted" },
  saved: { text: "Save ho gaya", tone: "text-trust" },
  error: { text: "Save nahi hua — connection check kariye", tone: "text-danger" },
};

/**
 * One client draft: fill it, invite the owner, watch the status.
 *
 * The deck is the *same* `SmartProfileDeck` a member uses on their own
 * profile — same quick picks, same cascades, same card physics. What differs
 * is one level up: `ManagedProfileDraftProvider` replaces `ProfileProvider`,
 * so every tap autosaves into this draft and cannot reach the signed-in
 * helper's own profile. `only={MANAGED_DRAFT_FIELD_KEYS}` drops the photo card
 * without the deck needing to know anything about managed mode.
 */
export default function ManagedDraftEditor({
  draft,
  history,
  canWriteValues,
  canManageClaimLink,
  accessRevoked,
  backHref,
  subjectWord,
}: Props) {
  const router = useRouter();
  const [deckOpen, setDeckOpen] = useState(false);
  const [saveState, setSaveState] = useState<ManagedSaveState>("idle");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkExpiry, setLinkExpiry] = useState<string | null>(draft.claimLinkExpiresAt);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const onSaveStateChange = useCallback((s: ManagedSaveState) => setSaveState(s), []);

  async function call(action: string, path: string, method: "POST" | "DELETE" = "POST") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(path, { method });
      const body = (await res.json().catch(() => ({}))) as { url?: string; expiresAt?: string; message?: string };
      if (!res.ok) {
        setError(body.message ?? "Ye kaam abhi nahi ho paya.");
        return null;
      }
      return body;
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function generateLink() {
    const body = await call("link", `/api/managed-profile/drafts/${draft.id}/claim-link`);
    if (!body?.url) return;
    setLinkUrl(body.url);
    setLinkExpiry(body.expiresAt ?? null);
    router.refresh();
  }

  async function revokeLink() {
    const body = await call("revoke", `/api/managed-profile/drafts/${draft.id}/claim-link`, "DELETE");
    if (!body) return;
    setLinkUrl(null);
    setLinkExpiry(null);
    router.refresh();
  }

  async function cancelDraft() {
    const body = await call("cancel", `/api/managed-profile/drafts/${draft.id}/cancel`);
    if (!body) return;
    router.push(backHref);
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
    } catch {
      setError("Copy nahi ho paya — link ko select karke khud copy kar lijiye.");
    }
  }

  const claimed = Boolean(draft.claimedAt);
  const saveCopy = SAVE_COPY[saveState];

  if (deckOpen) {
    return (
      <ManagedProfileDraftProvider
        draftId={draft.id}
        fillingForGender={draft.fillingForGender}
        onSaveStateChange={onSaveStateChange}
      >
        <SmartProfileDeck
          onBack={() => {
            setDeckOpen(false);
            router.refresh();
          }}
          only={MANAGED_DRAFT_FIELD_KEYS}
          scopeLabel={draft.displayLabel}
          noticeText={`${subjectWord === "client" ? "Client" : "Family"} draft — public nahi hai`}
        />
      </ManagedProfileDraftProvider>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      </div>

      <Card variant="luxe" padding="lg">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-wine-700">{draft.displayLabel}</h1>
          <span className="rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
            {DRAFT_STATUS_LABEL[draft.status]}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{DRAFT_STATUS_HINT[draft.status]}</p>

        <div className="mt-4 rounded-lg border border-line bg-bg-subtle px-3.5 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Bhara gaya</span>
            <span className="font-semibold tabular-nums text-ink">
              {draft.filledCount}/{draft.totalCount}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
              style={{ width: `${Math.min(100, Math.round((draft.filledCount / draft.totalCount) * 100))}%` }}
            />
          </div>
          {draft.missingRequiredLabels.length > 0 ? (
            <p className="mt-2.5 text-xs leading-relaxed text-warn">
              Zaroori baaki: {draft.missingRequiredLabels.join(", ")}
            </p>
          ) : (
            <p className="mt-2.5 text-xs text-trust">
              Saari zaroori details bhar gayi hain. Profile live tabhi hogi jab wo khud confirm karenge.
            </p>
          )}
        </div>

        {saveCopy && (
          <p className={cn("mt-3 inline-flex items-center gap-1.5 text-xs", saveCopy.tone)}>
            {saveState === "error" ? <WifiOff className="size-3.5" aria-hidden /> : null}
            {saveCopy.text}
          </p>
        )}

        {canWriteValues && (
          <div className="mt-5">
            <Button onClick={() => setDeckOpen(true)} icon={<PenLine className="size-4" />} fullWidth>
              {draft.filledCount > 1 ? "Continue Filling" : "Start Filling"}
            </Button>
          </div>
        )}
      </Card>

      {accessRevoked && (
        <Card variant="warning" padding="md">
          <div className="flex gap-2.5">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">Aapka access hata diya gaya hai</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Profile ab poori tarah unki hai. Aapko sirf ye status dikhta hai — koi detail nahi.
              </p>
            </div>
          </div>
        </Card>
      )}

      {canManageClaimLink && (
        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Link2 className="size-4 text-gold-600" aria-hidden />
            Claim link
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Ye link unhe bhejiye. Wo apne account se login karke, apna mobile ya email verify karke ye draft
            claim karenge. Link 48 ghante chalta hai aur ek hi baar istemaal hota hai.
          </p>

          {linkUrl ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-subtle px-3 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{linkUrl}</code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink touch-target"
                  aria-label="Copy link"
                >
                  {copied ? <Check className="size-4 text-trust" /> : <Copy className="size-4" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Ye link dobara nahi dikhega. Kho jaye to naya bana lijiye — purana apne aap band ho jayega.
              </p>
            </div>
          ) : linkExpiry ? (
            <p className="mt-4 rounded-lg border border-info/30 bg-info-bg px-3 py-2.5 text-xs leading-relaxed text-info">
              Ek link pehle se active hai (expiry: {new Date(linkExpiry).toLocaleString("en-IN")}). Suraksha ke
              liye wo dobara nahi dikhaya jaata — zaroorat ho to naya bana lijiye.
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <Button
              variant={linkExpiry ? "secondary" : "primary"}
              onClick={generateLink}
              loading={busy === "link"}
              icon={linkExpiry ? <RefreshCw className="size-4" /> : <Link2 className="size-4" />}
              fullWidth
            >
              {linkExpiry ? "Generate New Link" : "Generate Claim Link"}
            </Button>
            {linkExpiry && (
              <Button variant="secondary" onClick={revokeLink} loading={busy === "revoke"} fullWidth>
                Revoke Link
              </Button>
            )}
          </div>
        </Card>
      )}

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

      {claimed && (
        <Card variant="trust" padding="md">
          <div className="flex gap-2.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">Review chal raha hai</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {draft.reviewDone} details par faisla ho chuka hai, {draft.reviewPending} baaki. Kis detail par
                unhone kya kiya — ye aapko nahi dikhta, aur nahi dikhna chahiye.
              </p>
            </div>
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card padding="lg">
          <h2 className="text-base font-semibold text-ink">History</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink">{h.text}</span>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canManageClaimLink && !claimed && (
        <Card variant="soft" padding="md">
          <Button
            variant="ghost"
            onClick={cancelDraft}
            loading={busy === "cancel"}
            icon={<Trash2 className="size-4" />}
          >
            Close This Draft
          </Button>
          <p className="mt-1.5 text-xs text-muted">
            Claim hone ke baad ye option nahi rehta — tab data unka hota hai, aapka nahi.
          </p>
        </Card>
      )}
    </div>
  );
}
