"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Sheet from "@/components/ui/Sheet";
import { useT } from "@/components/i18n/LanguageProvider";
import type { ConciergePersonOption } from "@/lib/contracts/concierge";

/**
 * "Kis par?" — the step that makes a targeted action safe.
 *
 * `GrioMatchPicker` asks the same question for messages. This one exists
 * separately because it draws from a different list (see
 * `app/api/concierge/people/route.ts`) and, more importantly, because it is the
 * component that holds up the whole Phase H safety argument: the model proposes
 * *what*, and the only way *who* ever gets decided is a finger landing on a row
 * in here. There is no code path where an id arrives from a reply.
 *
 * Grouped by source rather than shown as one list, because "inhone aapko
 * interest bheja hai" and "aapne inhe save kiya tha" are two different
 * relationships, and a picker that flattens them invites the user to reply to
 * someone they thought they were merely saving.
 */

const GROUPS = [
  { source: "interest_received" as const, key: "grio.peopleWaiting", label: "Inhone aapko interest bheja hai" },
  { source: "shortlist" as const, key: "grio.peopleShortlisted", label: "Aapki shortlist" },
  { source: "same_vote" as const, key: "grio.peopleSameVote", label: "Inhone aaj aapke jaisa jawab diya" },
];

export default function GrioPersonPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (person: ConciergePersonOption) => void;
}) {
  const t = useT();
  const [people, setPeople] = useState<ConciergePersonOption[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeople(null);
    fetch("/api/concierge/people")
      .then((r) => r.json())
      .then((json) => setPeople(json.ok ? json.people : []))
      .catch(() => setPeople([]));
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} variant="bottom" title={t("grio.pickPerson", "Kis par?")}>
      {people === null ? (
        <p className="py-6 text-center text-[0.8125rem] text-muted">{t("grio.loading", "Load ho raha hai…")}</p>
      ) : people.length === 0 ? (
        <p className="py-6 text-center text-[0.8125rem] text-muted">
          {t(
            "grio.noPeople",
            "Abhi koi aisa rishta nahi hai. Kisi ki profile khol kar wahin se ye kaam kar sakte hain.",
          )}
        </p>
      ) : (
        <div className="-mx-2">
          {GROUPS.map((group) => {
            const rows = people.filter((p) => p.source === group.source);
            if (rows.length === 0) return null;
            return (
              <div key={group.source} className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                  {t(group.key, group.label)}
                </p>
                {rows.map((p) => (
                  <button
                    key={p.profileId}
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-bg-subtle"
                  >
                    <Avatar name={p.name} photoUrl={null} size="sm" />
                    <span className="font-medium text-ink">{p.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
