"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Lock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeFindFilters, type GrioFindFilters } from "@/lib/contracts/grio";

/**
 * The search Grio built, waiting for a tap.
 *
 * ## Why this is a confirm step and not a result
 *
 * The model wrote a filter set out of a sentence somebody typed. Between those
 * two things is the place where a misread — "26 se 31" heard as "26+", Jaipur
 * heard as Jodhpur — becomes a screen of the wrong people with no way to tell
 * that anything went wrong. So the chips come first, in the same words the
 * query will use, and nothing runs until the person reading them agrees.
 *
 * That gate is also what keeps this feature inside D-32. Grio proposes a
 * query; a finger runs it; the rows are fetched by this component from the
 * ordinary search endpoint and rendered here. Nothing about anybody in the
 * list travels back into a prompt, so there is no turn in which the model
 * could rank, compare or recommend one of them.
 *
 * ## Why it calls the ordinary search endpoint
 *
 * `/api/discover/search` already re-authorises the user, already enforces the
 * plan gate server-side, and already returns the deterministic ordering the
 * Discover page shows. A second endpoint for "the same search, but Grio asked"
 * would be a second place for those three things to be true — and the first
 * place one of them would stop being true.
 */

interface SearchResult {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  professionCategory: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoVerified: boolean;
}

/** What the search page's own query string calls these — one vocabulary, not two. */
function toQuery(filters: GrioFindFilters): string {
  const params = new URLSearchParams();
  if (filters.minAge !== null) params.set("minAge", String(filters.minAge));
  if (filters.maxAge !== null) params.set("maxAge", String(filters.maxAge));
  if (filters.cities.length > 0) params.set("cities", filters.cities.join(","));
  if (filters.education) params.set("education", filters.education);
  if (filters.professionCategory) params.set("professionCategory", filters.professionCategory);
  if (filters.maritalStatus) params.set("maritalStatus", filters.maritalStatus);
  if (filters.diet) params.set("diet", filters.diet);
  if (filters.verifiedOnly) params.set("verifiedOnly", "true");
  params.set("pageSize", "6");
  return params.toString();
}

export default function GrioFindCard({
  filters,
  skipped,
}: {
  filters: GrioFindFilters;
  skipped: string[];
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "locked" | "error">("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const chips = describeFindFilters(filters);

  async function run() {
    setState("loading");
    try {
      const res = await fetch(`/api/discover/search?${toQuery(filters)}`);
      const json = await res.json();
      if (res.status === 403) {
        // The plan gate, arriving as the product's own sentence rather than a
        // status code. It is reachable even though the prompt was told not to
        // offer search to this member: an entitlement can lapse between the
        // reply and the tap.
        setMessage(json.message ?? "Ye search aapke plan me abhi nahi hai.");
        setState("locked");
        return;
      }
      if (!res.ok || !json.ok) {
        setMessage(json.message ?? "Search nahi chal payi — dobara try karein.");
        setState("error");
        return;
      }
      setResults(json.results ?? []);
      setState("done");
    } catch {
      setMessage("Search nahi chal payi — dobara try karein.");
      setState("error");
    }
  }

  return (
    <div className="w-full max-w-[85%] rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
        <Search className="size-3.5" />
        Ye dhoondh raha hoon
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center rounded-full border border-line bg-canvas px-2 py-0.5 text-[0.75rem] text-ink"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Named, not swallowed. A filter Grio could not honour makes the search
          wider than what was asked for, and the person reading the chips is
          the only one who can decide whether that still answers their
          question. */}
      {skipped.length > 0 && (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
          Ye nahi laga paya: {skipped.join(", ")}.{" "}
          <Link href="/user/discover" className="underline underline-offset-2 hover:text-ink">
            Poore search me khud laga sakte hain
          </Link>
          .
        </p>
      )}

      {state === "idle" && (
        <button
          type="button"
          onClick={run}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Dikhao
        </button>
      )}

      {state === "loading" && (
        <div className="mt-3 flex items-center gap-2 text-[0.8125rem] text-muted">
          <Loader2 className="size-4 animate-spin" />
          Dhoondh raha hoon…
        </div>
      )}

      {(state === "locked" || state === "error") && message && (
        <div className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          <p>{message}</p>
          {state === "locked" && (
            <Link
              href="/user/discover"
              className="mt-2 inline-flex h-9 items-center rounded-full border border-line px-4 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-gold-400"
            >
              Discover khol kar dekhein
            </Link>
          )}
        </div>
      )}

      {state === "done" && (
        <div className="mt-3">
          {results.length === 0 ? (
            // Says which search found nobody, not "koi nahi mila". The
            // difference matters: the second reads as a statement about the
            // membership, and the person has no way to tell that widening one
            // chip would change it.
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              Is search par abhi koi nahi mila.{" "}
              <Link href="/user/discover" className="underline underline-offset-2 hover:text-ink">
                Filter thoda chauda karke dekhein
              </Link>
              .
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {results.map((r) => (
                  <li key={r.profileId}>
                    <Link
                      href={`/user/profile/${r.profileId}`}
                      className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas p-2 transition-colors hover:border-gold-400"
                    >
                      <span
                        className={cn(
                          "relative size-10 shrink-0 overflow-hidden rounded-full bg-surface",
                          !r.photoUnlocked && "grid place-items-center",
                        )}
                      >
                        {r.photoUnlocked && r.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <Lock className="size-3.5 text-muted" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-[0.8125rem] font-semibold text-ink">
                          <span className="truncate">{r.displayName}</span>
                          {r.age ? <span className="text-muted">, {r.age}</span> : null}
                          {r.photoVerified && <BadgeCheck className="size-3.5 shrink-0 text-wine-700" />}
                        </span>
                        <span className="block truncate text-[0.75rem] text-muted">
                          {[r.city, r.professionCategory ?? r.education].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/user/discover"
                className="mt-2 inline-block text-[0.75rem] text-muted underline underline-offset-2 hover:text-ink"
              >
                Poore search me aur dekhein
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
