"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { CONTROL_BASE, CONTROL_SIZE } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export const PARTNER_TYPE_OPTIONS = [
  { value: "PANDIT", label: "Pandit Ji" },
  { value: "MARRIAGE_BUREAU", label: "Marriage Bureau" },
  { value: "RISHTA_CONSULTANT", label: "Rishta Consultant" },
  { value: "COMMUNITY_COORDINATOR", label: "Community Coordinator" },
  { value: "FAMILY_REFERENCE_PARTNER", label: "Family Reference Partner" },
  { value: "WEDDING_VENDOR", label: "Wedding Vendor" },
  { value: "OTHER", label: "Other" },
] as const;

export default function PartnerApplyForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [partnerType, setPartnerType] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [expectedMonthlyReferrals, setExpectedMonthlyReferrals] = useState("");
  const [knownCommunityOrArea, setKnownCommunityOrArea] = useState("");
  const [notesFromPartner, setNotesFromPartner] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  const requiredFilled =
    fullName.trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(mobileNumber.trim()) &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    partnerType.length > 0;
  const canSubmit = requiredFilled && terms && privacy && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          mobileNumber: mobileNumber.trim(),
          email: email.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          partnerType,
          organizationName: organizationName.trim() || undefined,
          experienceYears: experienceYears ? Number(experienceYears) : undefined,
          expectedMonthlyReferrals: expectedMonthlyReferrals ? Number(expectedMonthlyReferrals) : undefined,
          knownCommunityOrArea: knownCommunityOrArea.trim() || undefined,
          notesFromPartner: notesFromPartner.trim() || undefined,
          termsAccepted: terms,
          privacyPolicyAccepted: privacy,
        }),
      });
      const json = await res.json();

      if (res.status === 401) {
        router.push("/login?next=/partner/register");
        return;
      }
      if (!res.ok) {
        setError(json.message ?? "Kuch galat ho gaya — dobara try karein.");
        return;
      }

      router.push("/partner/pending");
      router.refresh();
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card variant="default" padding="lg">
        <h1 className="text-center text-2xl font-bold text-wine-700">
          BandhanTak Partner banein — Members refer karein aur commission earn karein
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted">
          Apni details fill karein. Approval ke baad aap referral tools use kar paayenge.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
          <Input label="Poora naam" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
          <Input
            label="Mobile number"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder="10 digit number"
            required
          />
          <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} required maxLength={100} />
            <Input label="State" value={state} onChange={(e) => setState(e.target.value)} required maxLength={100} />
          </div>

          <div>
            <label htmlFor="partner-type" className="mb-1 block text-sm font-medium text-ink">
              Partner type
            </label>
            <select
              id="partner-type"
              value={partnerType}
              onChange={(e) => setPartnerType(e.target.value)}
              required
              className={cn(CONTROL_BASE, CONTROL_SIZE.md, "border-line-strong")}
            >
              <option value="">Select karein…</option>
              {PARTNER_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Organization name (optional)"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            maxLength={200}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Experience (saal)"
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
            />
            <Input
              label="Mahine me kitne referrals expect karte hain"
              value={expectedMonthlyReferrals}
              onChange={(e) => setExpectedMonthlyReferrals(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
            />
          </div>

          <Input
            label="Aapka community ya area (optional)"
            value={knownCommunityOrArea}
            onChange={(e) => setKnownCommunityOrArea(e.target.value)}
            maxLength={300}
          />

          <Textarea
            label="Kuch aur batana chahein? (optional)"
            value={notesFromPartner}
            onChange={(e) => setNotesFromPartner(e.target.value)}
            maxLength={1000}
            showCount
            rows={4}
          />

          <div className="space-y-2 rounded-md border border-line bg-bg-subtle p-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 size-4 accent-gold-600"
              />
              Main partner terms and conditions accept karta/karti hoon.
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-0.5 size-4 accent-gold-600"
              />
              Main privacy policy accept karta/karti hoon.
            </label>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={!canSubmit} loading={submitting}>
            Apply Karein
          </Button>

          <p className="text-center text-xs text-muted">
            Apply karne ke baad ye account partner dashboard use karega. Admin 24–48 ghante me review karega.
          </p>
        </form>
      </Card>
    </main>
  );
}
