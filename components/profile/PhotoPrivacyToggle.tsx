"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Meri photo sirf match par" — the owner's side of the D-90 photo rule.
 *
 * Off (the default) means members whose own profile is live and who have an
 * approved photo see yours, the same way you see theirs. On means nobody does
 * until a mutual match. The trade is written on the control, because the one
 * thing this switch must never be is a surprise.
 */
export default function PhotoPrivacyToggle({ initialMatchOnly }: { initialMatchOnly: boolean }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [matchOnly, setMatchOnly] = useState(initialMatchOnly);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !matchOnly;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/photo-privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next ? "MATCH_ONLY" : "MEMBERS" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("profile.photoPrivacy.saveFailed", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setMatchOnly(next);
      toast({
        title: next
          ? t("profile.photoPrivacy.turnedOn", "Ab aapki photo sirf match hone par dikhegi")
          : t("profile.photoPrivacy.turnedOff", "Ab live members aapki photo dekh sakte hain"),
        tone: "info",
      });
      router.refresh();
    } catch {
      toast({ title: t("profile.photoPrivacy.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[0.875rem] font-medium text-ink">
          <ImageOff className="size-3.5 shrink-0" />
          {t("profile.photoPrivacy.title", "Meri photo sirf match par")}
        </p>
        <p className="text-[0.75rem] leading-snug text-muted">
          {t(
            "profile.photoPrivacy.description",
            "Band hone par: jin members ki profile live hai aur apni photo lagi hai, wo aapki photo dekh sakte hain — jaise aap unki. On karne par: aapki photo sirf mutual match ke baad dikhegi.",
          )}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={matchOnly}
        aria-label={t("profile.photoPrivacy.title", "Meri photo sirf match par")}
        disabled={busy}
        onClick={toggle}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60",
          matchOnly ? "bg-gold-500" : "bg-line-strong",
        )}
      >
        {busy ? (
          <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin text-white" />
        ) : (
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
              matchOnly ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        )}
      </button>
    </div>
  );
}
