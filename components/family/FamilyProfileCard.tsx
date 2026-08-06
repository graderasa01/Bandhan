"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Loader2, Lock, MessageSquareText, Send } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import KundliNoteList from "@/components/profile/KundliNoteList";
import FamilyProfileDetail from "@/components/family/FamilyProfileDetail";
import { useToast } from "@/components/ui/Toast";
import type { FamilyProfileRow } from "@/lib/data/familyPortalData";
import type { FamilyPermissions } from "@/lib/services/family/familyConstants";
import type { ProfileViewModel } from "@/lib/contracts/profileView";

export default function FamilyProfileCard({
  row,
  permissions,
}: {
  row: FamilyProfileRow;
  permissions: FamilyPermissions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<ProfileViewModel | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const canShortlistThis = permissions.canManageShortlist && (row.isMatch || row.shortlistedByMe);

  async function toggleShortlist() {
    setBusy(true);
    try {
      const res = await fetch("/api/family-portal/shortlist", {
        method: row.shortlistedByMe ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: row.profileId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Action fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: row.shortlistedByMe ? "Shortlist se hata diya" : "Shortlist kar diya", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleDetail() {
    if (detail) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/family-portal/profile/${row.profileId}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Profile nahi khul paayi", description: json.message, tone: "error" });
        return;
      }
      setDetail(json.profile);
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function submitNote() {
    const body = noteDraft.trim();
    if (!body) return;
    setSubmittingNote(true);
    try {
      const res = await fetch("/api/family-portal/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: row.profileId, body }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Note save nahi hua", description: json.message, tone: "error" });
        return;
      }
      setNoteDraft("");
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
          {row.photoUnlocked && row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
            <img src={row.photoUrl} alt={row.displayName} className="size-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              <Lock className="size-5 text-muted" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-semibold text-ink">
              {row.displayName}
              {row.age ? `, ${row.age}` : ""}
            </h3>
            {row.isMatch && (
              <Badge variant="verified" size="sm">
                Match
              </Badge>
            )}
            {row.isShortlisted && (
              <Pill tone="gold" size="sm">
                Shortlisted
              </Pill>
            )}
          </div>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
            {[row.city, row.education].filter(Boolean).join(" · ") || "Details nahi bhari"}
          </p>
          {row.profession && <p className="truncate text-[0.8125rem] text-muted">{row.profession}</p>}
          {row.trustScore != null && (
            <Pill tone="trust" size="sm" className="mt-1">
              Trust {row.trustScore}
            </Pill>
          )}
        </div>
      </div>

      <KundliNoteList notes={row.kundliNotes} />

      <div className="mt-3 flex flex-wrap gap-2">
        {canShortlistThis && (
          <Button
            size="sm"
            variant={row.shortlistedByMe ? "secondary" : "accent"}
            icon={row.shortlistedByMe ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
            loading={busy}
            onClick={toggleShortlist}
          >
            {row.shortlistedByMe ? "Shortlisted" : "Shortlist"}
          </Button>
        )}
        {permissions.canViewProfileDetail && (
          <Button
            size="sm"
            variant="ghost"
            icon={
              loadingDetail ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : detail ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )
            }
            onClick={toggleDetail}
          >
            {detail ? "Kam Dikhayein" : "View Full Profile"}
          </Button>
        )}
      </div>

      {detail && <FamilyProfileDetail profile={detail} />}

      {(permissions.canWriteNotes || row.notes.length > 0) && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            <MessageSquareText className="size-3.5" />
            Family Notes
          </p>
          {row.notes.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {row.notes.map((n) => (
                <li key={n.id} className="rounded-md bg-bg-subtle px-3 py-2 text-[0.8125rem] text-ink">
                  <span className="font-semibold">{n.authorName}: </span>
                  {n.body}
                </li>
              ))}
            </ul>
          )}
          {permissions.canWriteNotes && (
            <div className="flex items-center gap-2">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
                placeholder="Apni raay likhein..."
                className="h-10 flex-1 rounded-full border border-line-strong bg-surface px-3.5 text-[0.8125rem] outline-none focus:border-gold-500"
              />
              <button
                type="button"
                disabled={!noteDraft.trim() || submittingNote}
                onClick={submitNote}
                aria-label="Send Note"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg disabled:opacity-40"
              >
                {submittingNote ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
