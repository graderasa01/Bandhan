"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import {
  GRIO_MEMORY_KINDS,
  GRIO_MEMORY_KIND_LABEL,
  GRIO_MEMORY_MAX_FACT_LENGTH,
  type GrioMemoryItem,
  type GrioMemoryKindValue,
  type GrioMemoryResponse,
} from "@/lib/contracts/grio";

/**
 * What Grio remembers, in the user's hands — doc 11 §3.5.
 *
 * This panel is the reason memory is allowed to be on by default. A store the
 * user cannot see is a store they cannot correct, and "the AI remembered
 * something about me that I never said and can't delete" is the exact failure
 * that makes people stop trusting an assistant. So the list is short enough to
 * read at a glance, every row has a delete, and the user can type their own
 * entries without going through the model at all.
 */
export default function GrioMemoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [items, setItems] = useState<GrioMemoryItem[]>([]);
  const [kind, setKind] = useState<GrioMemoryKindValue>("FACT");
  /**
   * The entry the next Add will replace, if any.
   *
   * Supersession is explicit — nothing infers that two entries conflict (see
   * memory.ts) — so this is the only place a user can say one thing replaces
   * another. It has to stay visible while they type, or Add silently means
   * something different from what it meant a moment ago.
   */
  const [replacing, setReplacing] = useState<GrioMemoryItem | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/grio/memory");
      const json = (await res.json()) as GrioMemoryResponse;
      if (json.ok && json.items) setItems(json.items);
      if (typeof json.limit === "number") setLimit(json.limit);
    } catch {
      /* An unreachable memory list is not worth a toast — the panel just shows empty. */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function mutate(init: RequestInit, url = "/api/grio/memory") {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const json = (await res.json()) as GrioMemoryResponse;
      // A refusal still carries the current list (the 409 "list is full" case),
      // so state is updated before the toast rather than only on success —
      // otherwise a full-list error would leave the panel showing stale counts.
      if (json.items) setItems(json.items);
      if (typeof json.limit === "number") setLimit(json.limit);
      if (!res.ok || !json.ok) {
        toast({
          title: t("grio.actionFailed", "Nahi ho paya"),
          description: json.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = draft.trim();
    if (!value) return;
    const supersedesId = replacing?.id;
    setDraft("");
    setReplacing(null);
    await mutate({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact: value, kind, supersedesId }),
    });
    setKind("FACT");
  }

  /**
   * Pre-fills the composer with the old wording rather than clearing it.
   *
   * "Bangalore preferred" becoming "Mumbai bhi theek hai" is one sentence being
   * corrected, not two unrelated typings — starting from the old text is what
   * makes it feel like editing a memory instead of filing a second one next to
   * the first.
   */
  function startReplace(item: GrioMemoryItem) {
    setReplacing(item);
    setDraft(item.body);
    setKind(item.kind);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="bottom"
      title="What Grio Remembers"
      description={
        limit === null
          ? t("grio.memoryOnlyYours", "Sirf wahi jo aapne khud bataya ya save kiya.")
          : t(
              "grio.memoryOnlyYoursWithLimit",
              "Sirf wahi jo aapne khud bataya ya save kiya. Aapke plan me {limit} baatein — abhi {count} save hain.",
            )
              .replace("{limit}", String(limit))
              .replace("{count}", String(items.length))
      }
    >
      {/* The over-limit state is legal, not an error: a plan downgrade never
          deletes what was already saved (see lib/services/grio/memory.ts), so
          the panel has to be able to explain a list longer than the plan. */}
      {limit !== null && items.length > limit && (
        <p className="mb-3 rounded-md border border-line bg-bg-subtle px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
          {t(
            "grio.memoryOverLimit",
            "Aapke plan me ab {limit} baatein save hoti hain, par purani ek bhi hataayi nahi gayi — sab yahin hain aur Grio inhe abhi bhi yaad rakhta hai. Nayi baat jodne ke liye pehle koi purani hataani hogi.",
          ).replace("{limit}", String(limit))}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-[0.875rem] leading-relaxed text-muted">
          {t(
            "grio.memoryEmpty",
            "Abhi kuch yaad nahi hai. Baat-cheet me jab aap apne baare me kuch batayenge, Grio use save karne ka button dega — ya aap yahin khud likh sakte hain.",
          )}
        </p>
      ) : (
        <ul className="space-y-2 py-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-2 rounded-md border border-line bg-bg-subtle px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] leading-relaxed text-ink">{item.body}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-muted">
                  {/* The kind earns its place on the row: a deal-breaker and a
                      passing preference read identically as bare sentences, and
                      they are the two the user most needs to tell apart when
                      deciding what to correct. */}
                  <span className="rounded bg-surface px-1.5 py-0.5 font-medium">
                    {GRIO_MEMORY_KIND_LABEL[item.kind]}
                  </span>
                  {item.replaces && (
                    <span>
                      {t("grio.memoryReplaced", "pehle: “{old}”").replace("{old}", item.replaces)}
                    </span>
                  )}
                  {item.expiresAt && (
                    <span>
                      {t("grio.memoryExpires", "{date} tak").replace(
                        "{date}",
                        new Date(item.expiresAt).toLocaleDateString(),
                      )}
                    </span>
                  )}
                </span>
              </span>

              <button
                type="button"
                disabled={busy}
                onClick={() => startReplace(item)}
                aria-label={t("grio.updateFact", "“{fact}” badlein").replace("{fact}", item.body)}
                className="-m-1 grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate({ method: "DELETE" }, `/api/grio/memory?id=${encodeURIComponent(item.id)}`)}
                aria-label={t("grio.removeFact", "“{fact}” hataayein").replace("{fact}", item.body)}
                className="-m-1 grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <label htmlFor="grio-memory-add" className="text-[0.8125rem] font-medium text-ink">
          {replacing ? t("grio.updatingThis", "Ise badal rahe hain") : t("grio.addYourOwn", "Khud kuch jodein")}
        </label>

        {/* Visible for as long as it applies. Add means something different
            while this banner is up, and a mode the user cannot see is a mode
            they will trip over. */}
        {replacing && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-gold-300/70 bg-bg-subtle px-3 py-2 text-[0.75rem] text-muted dark:border-gold-700/60">
            <span className="min-w-0 flex-1 truncate">
              {t("grio.replacingOld", "Purani baat: “{old}”").replace("{old}", replacing.body)}
            </span>
            <button
              type="button"
              onClick={() => {
                setReplacing(null);
                setDraft("");
              }}
              aria-label={t("grio.cancelReplace", "Badalna cancel karein")}
              className="-m-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Kind is a choice, not a guess. Inferring it from the wording would
            be the same invented certainty the whole memory design refuses. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GRIO_MEMORY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-full border px-2.5 py-1 text-[0.6875rem] transition-colors ${
                kind === k
                  ? "border-gold-400 bg-gold-400/15 font-medium text-ink"
                  : "border-line text-muted hover:border-gold-400"
              }`}
            >
              {GRIO_MEMORY_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            id="grio-memory-add"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, GRIO_MEMORY_MAX_FACT_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder={t("grio.addFactPlaceholder", "Jaise: Bengaluru me job karta hoon")}
            className="min-h-11 flex-1 rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
          />
          <Button variant="secondary" disabled={!draft.trim() || busy} onClick={add}>
            {replacing ? "Update" : "Add"}
          </Button>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => mutate({ method: "DELETE" })}
            className="mt-3 text-[0.8125rem] text-muted underline underline-offset-2 transition-colors hover:text-danger"
          >
            Forget Everything
          </button>
        )}
      </div>
    </Sheet>
  );
}
