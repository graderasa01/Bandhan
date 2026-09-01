"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, BadgeCheck, CalendarClock, Lock, NotebookPen, Search, Send, ShieldCheck, Trash2, Undo2,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import {
  DESK_SEARCH_DAILY_LIMIT,
  MAX_PROPOSAL_REASON_CHARS,
  MIN_PROPOSAL_REASON_CHARS,
  PROPOSAL_SOURCE_LABEL,
  PROPOSAL_STATUS_LABEL,
} from "@/lib/services/clientDesk/clientDeskPolicy";
import type { ClientSummary } from "@/lib/services/clientDesk/clientDeskService";
import type { ProposalView } from "@/lib/services/clientDesk/proposalService";
import type { ProfileDelegatePermission } from "@prisma/client";
import { cn } from "@/lib/utils";

interface SearchRow {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  trustScore: number | null;
  alreadyProposed: boolean;
}

export interface DeskNote {
  id: string;
  body: string;
  createdAt: string;
}

/**
 * One client's desk.
 *
 * Three things this screen is careful to keep true:
 *
 * 1. **It shows what the partner may do, before they try.** Permissions are
 *    rendered as a visible scope strip with an expiry, and a tool the partner
 *    does not hold is absent rather than present-and-disabled — a greyed-out
 *    Search button invites a support ticket, an explained absence does not.
 * 2. **Search results carry no faces.** Deliberate, and said on the screen so
 *    the partner does not think it is a loading bug. The owner sees the photo
 *    in their own queue, which is where a face is relevant to a decision.
 * 3. **Nothing here sends anything.** Every action ends in a proposal the
 *    client answers.
 */
export default function ClientDeskClient({
  client,
  initialProposals,
  initialNotes,
  defaults,
}: {
  client: ClientSummary;
  initialProposals: ProposalView[];
  initialNotes: DeskNote[];
  defaults: { minAge: number | null; maxAge: number | null; cities: string[]; education: string | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"search" | "proposals" | "notes">("search");

  const [minAge, setMinAge] = useState(defaults.minAge ? String(defaults.minAge) : "");
  const [maxAge, setMaxAge] = useState(defaults.maxAge ? String(defaults.maxAge) : "");
  const [city, setCity] = useState(defaults.cities[0] ?? "");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchesLeft, setSearchesLeft] = useState<number | null>(null);

  const [proposals, setProposals] = useState(initialProposals);
  const [notes, setNotes] = useState(initialNotes);
  const [noteBody, setNoteBody] = useState("");

  const [proposing, setProposing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const has = (p: ProfileDelegatePermission) => client.permissions.includes(p);

  async function call(path: string, body: unknown, key: string, method: "POST" | "DELETE" = "POST") {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Ye action poora nahi hua.");
        return null;
      }
      return data;
    } catch {
      setError("Internet nahi mil raha.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runSearch() {
    const data = await call(
      `/api/partner/desk/${client.ownerUserId}/search`,
      {
        minAge: minAge ? Number(minAge) : null,
        maxAge: maxAge ? Number(maxAge) : null,
        cities: city.trim() ? [city.trim()] : [],
      },
      "search",
    );
    if (!data) return;
    setRows((data.rows as SearchRow[]) ?? []);
    setSearchesLeft((data.searchesLeftToday as number) ?? null);
    setSearched(true);
  }

  async function submitProposal(profileId: string) {
    const data = await call(
      `/api/partner/desk/${client.ownerUserId}/proposals`,
      {
        candidateProfileId: profileId,
        reason: reason.trim(),
        source: "PARTNER_SEARCH",
        draftMessage: has("DRAFT_MESSAGE") && draft.trim() ? draft.trim() : null,
      },
      `p-${profileId}`,
    );
    if (!data) return;
    setProposing(null);
    setReason("");
    setDraft("");
    setRows((prev) => prev.map((r) => (r.profileId === profileId ? { ...r, alreadyProposed: true } : r)));
    const refreshed = await fetch(`/api/partner/desk/${client.ownerUserId}/proposals`);
    if (refreshed.ok) setProposals(((await refreshed.json()) as { proposals: ProposalView[] }).proposals);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/partner/clients?tab=active" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Clients
        </Link>
      </div>

      <Card variant="luxe" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-wine-700">{client.displayName}</h1>
            <p className="mt-0.5 text-xs text-muted">
              Profile {client.completionPercent}% · {client.profileLive ? "live" : "abhi live nahi"}
            </p>
          </div>
          {client.daysLeft !== null && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-[0.6875rem] text-muted">
              <CalendarClock className="size-3" aria-hidden />
              {client.daysLeft} din baaki
            </span>
          )}
        </div>

        {/* The scope strip. A partner should never have to guess what they are
            allowed to do, and an owner should be able to see the same list on
            their own Access screen and recognise it. */}
        <div className="mt-4 rounded-lg border border-line bg-bg-subtle p-3.5">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
            <ShieldCheck className="size-3.5 text-trust" aria-hidden />
            Aapko kya permission hai
          </p>
          <ul className="mt-2 space-y-1">
            {client.permissionLabels.map((l) => (
              <li key={l} className="text-xs leading-snug text-muted">
                • {l}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
            Inke bahar kuch nahi — na chat, na number, na documents. Client jab chahe ye hata sakte hain.
          </p>
        </div>

        {client.missingRequiredLabels.length > 0 && (
          <p className="mt-3 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
            Profile live hone ke liye baaki: {client.missingRequiredLabels.join(", ")}
          </p>
        )}
      </Card>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        {(
          [
            ["search", "Search"],
            ["proposals", `Suggestions (${proposals.filter((p) => p.status === "PROPOSED").length})`],
            ["notes", "My Notes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "min-h-12 rounded-full border px-4 text-sm font-medium transition-colors",
              tab === id
                ? "border-transparent bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg"
                : "border-line-strong bg-surface text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "search" &&
        (!has("SEARCH_FOR_CLIENT") ? (
          <Card variant="soft" padding="lg" className="text-center">
            <Lock className="mx-auto size-8 text-muted" aria-hidden />
            <p className="mt-3 font-semibold text-ink">Search ki permission nahi hai.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              Client apni Profile Access screen se ye permission de sakte hain. Aap unse poochh sakte hain —
              yahan se maang nahi bheji ja sakti.
            </p>
          </Card>
        ) : (
          <>
            <Card padding="lg">
              <p className="text-sm leading-relaxed text-muted">
                Ye search client ki apni pasand se chalti hai — jo profiles unhe dikhti hain, bilkul wahi
                aapko dikhengi. Na zyada, na kam.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input label="Min age" type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
                <Input label="Max age" type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
                <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={runSearch} loading={busy === "search"} icon={<Search className="size-4" />}>
                  Search
                </Button>
                {searchesLeft !== null && (
                  <span className="text-xs text-muted">
                    Aaj {searchesLeft} search baaki (roz {DESK_SEARCH_DAILY_LIMIT})
                  </span>
                )}
              </div>
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
                Photo yahan nahi dikhti — jaan-boojh kar. Client ko apni queue me poori profile dikhegi. Har
                search unki access history me likhi jaati hai.
              </p>
            </Card>

            {searched && rows.length === 0 && (
              <Card variant="soft" padding="lg" className="text-center">
                <p className="text-sm text-muted">Is filter par koi profile nahi mili.</p>
              </Card>
            )}

            {rows.map((r) => (
              <Card key={r.profileId} padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{r.displayName}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[r.age ? `${r.age} saal` : null, r.city, r.education, r.professionCategory, r.maritalStatus]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {r.trustScore !== null && (
                    <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] text-muted">
                      Trust {r.trustScore}
                    </span>
                  )}
                </div>

                {r.alreadyProposed ? (
                  <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-trust">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    Suggest ho chuki hai
                  </p>
                ) : !has("PROPOSE_SHORTLIST") ? (
                  <p className="mt-2.5 text-xs text-muted">Suggest karne ki permission nahi hai.</p>
                ) : proposing === r.profileId ? (
                  <div className="mt-3">
                    <Textarea
                      label="Wajah — client ko yahi dikhega"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      maxLength={MAX_PROPOSAL_REASON_CHARS}
                      placeholder="Jaise: dono Jaipur me hain, education aur family type dono match karte hain."
                    />
                    {has("DRAFT_MESSAGE") && (
                      <div className="mt-2.5">
                        <Textarea
                          label="Pehla message (optional) — bhejenge wo khud"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={2}
                          maxLength={600}
                        />
                      </div>
                    )}
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="sm"
                        loading={busy === `p-${r.profileId}`}
                        disabled={reason.trim().length < MIN_PROPOSAL_REASON_CHARS}
                        onClick={() => submitProposal(r.profileId)}
                        icon={<Send className="size-4" />}
                      >
                        Send Suggestion
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setProposing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2.5"
                    onClick={() => {
                      setProposing(r.profileId);
                      setReason("");
                      setDraft("");
                    }}
                  >
                    Suggest to Client
                  </Button>
                )}
              </Card>
            ))}
          </>
        ))}

      {tab === "proposals" && (
        <>
          {proposals.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="text-sm text-muted">Abhi koi suggestion nahi bheja.</p>
            </Card>
          ) : (
            proposals.map((p) => (
              <Card key={p.id} padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{p.candidateName}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[p.candidateAge ? `${p.candidateAge} saal` : null, p.candidateCity].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-[0.6875rem] text-muted">
                    {PROPOSAL_STATUS_LABEL[p.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.reason}</p>
                {p.fitScore !== null && (
                  <p className="mt-1.5 text-[0.6875rem] text-muted">Fit score (code ka): {p.fitScore}%</p>
                )}
                {p.ownerNote && (
                  <p className="mt-2 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-xs leading-relaxed text-ink">
                    Client ne likha: {p.ownerNote}
                  </p>
                )}
                {p.status === "PROPOSED" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2.5"
                    loading={busy === `w-${p.id}`}
                    icon={<Undo2 className="size-4" />}
                    onClick={async () => {
                      const ok = await call(`/api/partner/proposals/${p.id}`, {}, `w-${p.id}`);
                      if (ok) {
                        setProposals((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, status: "WITHDRAWN" as const } : x)),
                        );
                      }
                    }}
                  >
                    Withdraw
                  </Button>
                )}
              </Card>
            ))
          )}
        </>
      )}

      {tab === "notes" && (
        <>
          <Card padding="lg">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
              <NotebookPen className="size-4 text-gold-600" aria-hidden />
              Sirf aapke liye
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Ye notes client ko kabhi nahi dikhte, aur inhe kabhi unki profile ya suggestion me nahi daala
              jaata. Complaint ki soorat me admin dekh sakta hai.
            </p>
            <div className="mt-3">
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} maxLength={2000} />
            </div>
            <Button
              size="sm"
              className="mt-2.5"
              loading={busy === "note"}
              disabled={!noteBody.trim()}
              onClick={async () => {
                const ok = await call(`/api/partner/desk/${client.ownerUserId}/notes`, { body: noteBody.trim() }, "note");
                if (!ok) return;
                setNoteBody("");
                const refreshed = await fetch(`/api/partner/desk/${client.ownerUserId}/notes`);
                if (refreshed.ok) setNotes(((await refreshed.json()) as { notes: DeskNote[] }).notes);
              }}
            >
              Add Note
            </Button>
          </Card>

          {notes.map((n) => (
            <Card key={n.id} padding="md">
              <p className="text-sm leading-relaxed text-ink">{n.body}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[0.6875rem] text-muted">
                  {new Date(n.createdAt).toLocaleDateString("en-IN")}
                </span>
                <button
                  type="button"
                  aria-label="Delete note"
                  className="grid size-10 place-items-center rounded-full text-muted hover:bg-bg-subtle touch-target"
                  onClick={async () => {
                    const ok = await call(
                      `/api/partner/desk/${client.ownerUserId}/notes`,
                      { noteId: n.id },
                      `n-${n.id}`,
                      "DELETE",
                    );
                    if (ok) setNotes((prev) => prev.filter((x) => x.id !== n.id));
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </Card>
          ))}
        </>
      )}

      <Card variant="soft" padding="md">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Aap suggest karte hain — bhejte client khud hain. Interest, message aur contact sab unke apne
            faisle hain. Source: {PROPOSAL_SOURCE_LABEL.PARTNER_SEARCH}.
          </p>
        </div>
      </Card>
    </div>
  );
}
