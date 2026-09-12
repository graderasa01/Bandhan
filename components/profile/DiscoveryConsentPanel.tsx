"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { SENSITIVE_CONSENT_LABELS, type SensitiveConsentKey } from "@/lib/discovery/contract";

export type ConsentMap = Record<SensitiveConsentKey, boolean>;
export type ConsentValues = Record<SensitiveConsentKey, string | null>;

const ORDER: SensitiveConsentKey[] = ["religion", "caste", "gotra", "manglik", "income"];

/**
 * "Kya mujhe is field se dhoondha ja sakta hai?" — five switches, all off until
 * the owner says otherwise. Each row states the exact value that would become
 * findable, because "religion searchable" is an abstraction and "Religion:
 * Hindu — search me aa sakta hai" is a decision. A field that was never filled
 * says so and its switch does nothing, which is the honest thing for a switch
 * with nothing behind it to do.
 */
export default function DiscoveryConsentPanel({ initialConsent, values }: { initialConsent: ConsentMap; values: ConsentValues }) {
  const t = useT();
  const { toast } = useToast();
  const [consent, setConsent] = useState(initialConsent);
  const [busyKey, setBusyKey] = useState<SensitiveConsentKey | null>(null);

  async function toggle(key: SensitiveConsentKey) {
    const next = !consent[key];
    setBusyKey(key);
    try {
      const res = await fetch("/api/profile/discovery-consent", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: next }) });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("profile.discoveryConsent.saveFailed", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setConsent(json.consent);
      toast({
        title: next
          ? `${SENSITIVE_CONSENT_LABELS[key]} — ${t("profile.discoveryConsent.on", "ab search me aa sakta hai")}`
          : `${SENSITIVE_CONSENT_LABELS[key]} — ${t("profile.discoveryConsent.off", "search se bahar")}`,
        tone: "info",
      });
    } catch {
      toast({ title: t("profile.discoveryConsent.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card variant="default" padding="md">
      <h2 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
        <Search className="size-4 text-wine-700" aria-hidden />
        {t("profile.discoveryConsent.title", "Search me kya dhoondha ja sake")}
      </h2>
      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
        {t(
          "profile.discoveryConsent.body",
          "Ye fields kisi ko aapke card par nahi dikhti. Par agar koi Discover me “manglik” ya “Hindu” filter lagaye aur aap result me aayein, to utna pata chal jaata hai. Isliye har field ke liye alag switch — default sab band. Band rehne par aap us filter ke result me kabhi nahi aate, bilkul waise hi jaise field bhari hi na ho.",
        )}
      </p>

      <ul className="mt-3 divide-y divide-line">
        {ORDER.map((key) => {
          const value = values[key];
          const on = consent[key];
          const busy = busyKey === key;
          return (
            <li key={key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[0.875rem] font-medium text-ink">{SENSITIVE_CONSENT_LABELS[key]}</p>
                <p className="text-[0.75rem] text-muted">
                  {value
                    ? on
                      ? `${value} — ${t("profile.discoveryConsent.rowOn", "is value se search me aa sakte hain")}`
                      : `${value} — ${t("profile.discoveryConsent.rowOff", "search se bahar")}`
                    : t("profile.discoveryConsent.notFilled", "Abhi bhara nahi hai — switch on karne se bhi kuch nahi dhoondha jayega.")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${SENSITIVE_CONSENT_LABELS[key]} ${t("profile.discoveryConsent.switchLabel", "search me")}`}
                disabled={busy}
                onClick={() => toggle(key)}
                className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60", on ? "bg-gold-500" : "bg-line-strong")}
              >
                {busy ? (
                  <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin text-white" aria-hidden />
                ) : (
                  <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
