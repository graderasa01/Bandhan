"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils";

/**
 * "Kis ke liye bhar rahe hain" — the one question that has to be answered
 * before a single field exists.
 *
 * Gender is a tap, not a guess: the deck derives `questionForChild` phrasing
 * from it and the value is seeded as the draft's first proposal. It is still
 * on the sensitive list, so the owner confirms it individually at review — the
 * pre-fill saves a tap without pre-empting a decision.
 */
export default function NewDraftForm({
  backHref,
  detailHrefPrefix,
  subjectWord,
}: {
  backHref: string;
  /** e.g. "/partner/clients" — the created draft opens at `${prefix}/${id}`. */
  detailHrefPrefix: string;
  /** "client" or "ghar wale" — the only copy that differs between the two hosts. */
  subjectWord: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [gender, setGender] = useState<"Ladka" | "Ladki" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!gender || label.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/managed-profile/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_label: label.trim(), filling_for_gender: gender }),
      });
      const body = (await res.json()) as { draftId?: string; message?: string };
      if (!res.ok || !body.draftId) {
        setError(body.message ?? "Draft nahi ban paya. Thodi der baad koshish kariye.");
        setBusy(false);
        return;
      }
      router.push(`${detailHrefPrefix}/${body.draftId}`);
    } catch {
      setError("Internet nahi mil raha. Connection check karke dobara koshish kariye.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Card variant="luxe" padding="lg">
        <h1 className="text-xl font-semibold text-wine-700">Naya {subjectWord} draft</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Ye draft sirf aapko dikhega. Jab tak wo khud apne account se claim aur confirm nahi karte, ye kahin
          public nahi hota — na Reel me, na search me.
        </p>

        <div className="mt-6">
          <Input
            label={`${subjectWord === "client" ? "Client" : "Unka"} naam ya short label`}
            placeholder="Jaise: Priya S. — Jaipur"
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            helperText="Sirf pehchanne ke liye. Poora naam draft ke andar bharenge."
          />
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-ink">Kiske liye bhar rahe hain?</legend>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {(["Ladka", "Ladki"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                aria-pressed={gender === g}
                className={cn(
                  "min-h-12 rounded-full border px-4 text-[0.9375rem] font-medium transition-all duration-200",
                  gender === g
                    ? "border-transparent bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg shadow-gold"
                    : "border-line-strong bg-surface text-ink hover:border-gold-500",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <Button onClick={submit} loading={busy} disabled={!gender || label.trim().length < 2} fullWidth>
            Create Draft
          </Button>
          <Button variant="ghost" onClick={() => router.push(backHref)} fullWidth>
            Cancel
          </Button>
        </div>
      </Card>

      <Card variant="soft" padding="md">
        <div className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Aap unki taraf se account nahi bana rahe. Profile hamesha unki rahegi — aap sirf details tayyar kar
            rahe hain, jo wo khud dekh kar confirm karenge.
          </p>
        </div>
        <div className="mt-3 flex gap-2.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Photo aur documents aap upload nahi kar sakte — wo unka apna kaam hai, claim karne ke baad.
          </p>
        </div>
      </Card>
    </div>
  );
}
