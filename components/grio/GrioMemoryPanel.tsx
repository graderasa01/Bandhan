"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { GRIO_MEMORY_MAX_FACT_LENGTH, type GrioMemoryResponse } from "@/lib/contracts/grio";

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
  const { toast } = useToast();
  const [facts, setFacts] = useState<string[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/grio/memory");
      const json = (await res.json()) as GrioMemoryResponse;
      if (json.ok && json.facts) setFacts(json.facts);
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
      if (json.facts) setFacts(json.facts);
      if (typeof json.limit === "number") setLimit(json.limit);
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = draft.trim();
    if (!value) return;
    setDraft("");
    await mutate({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact: value }),
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="bottom"
      title="What Grio Remembers"
      description={
        limit === null
          ? "Sirf wahi jo aapne khud bataya ya save kiya."
          : `Sirf wahi jo aapne khud bataya ya save kiya. Aapke plan me ${limit} baatein — abhi ${facts.length} save hain.`
      }
    >
      {/* The over-limit state is legal, not an error: a plan downgrade never
          deletes what was already saved (see lib/services/grio/memory.ts), so
          the panel has to be able to explain a list longer than the plan. */}
      {limit !== null && facts.length > limit && (
        <p className="mb-3 rounded-md border border-line bg-bg-subtle px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
          Aapke plan me ab {limit} baatein save hoti hain, par purani ek bhi hataayi nahi gayi — sab yahin
          hain aur Grio inhe abhi bhi yaad rakhta hai. Nayi baat jodne ke liye pehle koi purani hataani hogi.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : facts.length === 0 ? (
        <p className="py-4 text-[0.875rem] leading-relaxed text-muted">
          Abhi kuch yaad nahi hai. Baat-cheet me jab aap apne baare me kuch batayenge, Grio use save karne
          ka button dega — ya aap yahin khud likh sakte hain.
        </p>
      ) : (
        <ul className="space-y-2 py-1">
          {facts.map((fact) => (
            <li
              key={fact}
              className="flex items-start justify-between gap-3 rounded-md border border-line bg-bg-subtle px-3.5 py-2.5"
            >
              <span className="text-[0.875rem] leading-relaxed text-ink">{fact}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate({ method: "DELETE" }, `/api/grio/memory?fact=${encodeURIComponent(fact)}`)}
                aria-label={`"${fact}" hataayein`}
                className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <label htmlFor="grio-memory-add" className="text-[0.8125rem] font-medium text-ink">
          Khud kuch jodein
        </label>
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
            placeholder="Jaise: Bengaluru me job karta hoon"
            className="min-h-11 flex-1 rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
          />
          <Button variant="secondary" disabled={!draft.trim() || busy} onClick={add}>
            Add
          </Button>
        </div>
        {facts.length > 0 && (
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
