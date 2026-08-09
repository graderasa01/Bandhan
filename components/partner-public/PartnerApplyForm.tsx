"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import { CONTROL_BASE, CONTROL_SIZE } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

export const PARTNER_TYPE_OPTIONS = [
  { value: "PANDIT", label: "Pandit Ji" },
  { value: "MARRIAGE_BUREAU", label: "Marriage Bureau" },
  { value: "RISHTA_CONSULTANT", label: "Rishta Consultant" },
  { value: "COMMUNITY_COORDINATOR", label: "Community Coordinator" },
  { value: "FAMILY_REFERENCE_PARTNER", label: "Family Reference Partner" },
  { value: "WEDDING_VENDOR", label: "Wedding Vendor" },
  { value: "OTHER", label: "Other" },
] as const;

const PARTNER_TYPE_KEY: Record<(typeof PARTNER_TYPE_OPTIONS)[number]["value"], string> = {
  PANDIT: "partnerPublic.apply.type.pandit",
  MARRIAGE_BUREAU: "partnerPublic.apply.type.marriageBureau",
  RISHTA_CONSULTANT: "partnerPublic.apply.type.rishtaConsultant",
  COMMUNITY_COORDINATOR: "partnerPublic.apply.type.communityCoordinator",
  FAMILY_REFERENCE_PARTNER: "partnerPublic.apply.type.familyReferencePartner",
  WEDDING_VENDOR: "partnerPublic.apply.type.weddingVendor",
  OTHER: "partnerPublic.apply.type.other",
};

export default function PartnerApplyForm({ loggedIn }: { loggedIn: boolean }) {
  const t = useT();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts as the server's answer, but flips true the moment a from-scratch
  // applicant's own /api/auth/register call succeeds — so if the follow-up
  // /api/partners/apply call fails (network blip) and they hit submit again,
  // the retry doesn't try to register the same mobile a second time.
  const [hasSession, setHasSession] = useState(loggedIn);

  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    (hasSession || password.length >= 8) &&
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
      // No separate "create your account first" page — this same
      // partner-branded form creates the account when there isn't one yet,
      // then immediately applies with it. Login's mobile/email uniqueness
      // check is what actually stops a duplicate account, not this form.
      if (!hasSession) {
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName.trim(),
            mobile: mobileNumber.trim(),
            email: email.trim() || undefined,
            password,
          }),
        });
        const regJson = await regRes.json();
        if (!regRes.ok) {
          setError(
            regJson.error === "ALREADY_EXISTS"
              ? t(
                  "partnerPublic.apply.errorAlreadyExists",
                  "Is mobile/email se account pehle se bana hua hai — login karke apply karein.",
                )
              : (regJson.message ?? t("partnerPublic.apply.errorAccountFailed", "Account nahi ban paya.")),
          );
          return;
        }
        setHasSession(true);
      }

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
        // Only reachable if a session cookie expired mid-form — the normal
        // logged-out path above never gets here without one.
        router.push("/login?next=/partner/register");
        return;
      }
      if (!res.ok) {
        setError(json.message ?? t("partnerPublic.apply.errorGeneric", "Kuch galat ho gaya — dobara try karein."));
        return;
      }

      router.push("/partner/pending");
      router.refresh();
    } catch {
      setError(t("partnerPublic.apply.errorNetwork", "Network error — dobara try karein."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card variant="default" padding="lg">
        <h1 className="text-center text-2xl font-bold text-wine-700">
          {t(
            "partnerPublic.apply.heading",
            "BandhanTak Partner banein — Members refer karein aur commission earn karein",
          )}
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted">
          {t(
            "partnerPublic.apply.subheading",
            "Apni details fill karein. Approval ke baad aap referral tools use kar paayenge.",
          )}
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
          <Input
            label={t("partnerPublic.apply.fullNameLabel", "Poora naam")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={100}
          />
          <Input
            label={t("partnerPublic.apply.mobileLabel", "Mobile number")}
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder={t("partnerPublic.apply.mobilePlaceholder", "10 digit number")}
            required
          />
          <Input
            label={
              hasSession
                ? t("partnerPublic.apply.emailLabelOptional", "Email (optional)")
                : t("partnerPublic.apply.emailLabelRequired", "Email (mobile na ho to zaroori)")
            }
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {!hasSession && (
            <>
              <Input
                label={t("partnerPublic.apply.passwordLabel", "Password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText={t(
                  "partnerPublic.apply.passwordHelper",
                  "Kam se kam 8 characters — yehi aapka partner login banega",
                )}
                required
              />
              <p className="text-sm text-muted">
                {t("partnerPublic.apply.alreadyHaveAccount", "Pehle se BandhanTak account hai?")}{" "}
                <a href="/login?next=/partner/register" className="font-medium text-gold-700">
                  {t("partnerPublic.apply.logIn", "Log In")}
                </a>
              </p>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("partnerPublic.apply.cityLabel", "City")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              maxLength={100}
            />
            <Input
              label={t("partnerPublic.apply.stateLabel", "State")}
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="partner-type" className="mb-1 block text-sm font-medium text-ink">
              {t("partnerPublic.apply.partnerTypeLabel", "Partner type")}
            </label>
            <select
              id="partner-type"
              value={partnerType}
              onChange={(e) => setPartnerType(e.target.value)}
              required
              className={cn(CONTROL_BASE, CONTROL_SIZE.md, "border-line-strong")}
            >
              <option value="">{t("partnerPublic.apply.selectPlaceholder", "Select karein…")}</option>
              {PARTNER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(PARTNER_TYPE_KEY[opt.value], opt.label)}
                </option>
              ))}
            </select>
          </div>

          <Input
            label={t("partnerPublic.apply.organizationLabel", "Organization name (optional)")}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            maxLength={200}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("partnerPublic.apply.experienceLabel", "Experience (saal)")}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
            />
            <Input
              label={t(
                "partnerPublic.apply.expectedReferralsLabel",
                "Mahine me kitne referrals expect karte hain",
              )}
              value={expectedMonthlyReferrals}
              onChange={(e) => setExpectedMonthlyReferrals(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
            />
          </div>

          <Input
            label={t("partnerPublic.apply.communityLabel", "Aapka community ya area (optional)")}
            value={knownCommunityOrArea}
            onChange={(e) => setKnownCommunityOrArea(e.target.value)}
            maxLength={300}
          />

          <Textarea
            label={t("partnerPublic.apply.notesLabel", "Kuch aur batana chahein? (optional)")}
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
              {t("partnerPublic.apply.termsLabel", "Main partner terms and conditions accept karta/karti hoon.")}
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-0.5 size-4 accent-gold-600"
              />
              {t("partnerPublic.apply.privacyLabel", "Main privacy policy accept karta/karti hoon.")}
            </label>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={!canSubmit} loading={submitting}>
            {t("partnerPublic.apply.submitButton", "Apply Now")}
          </Button>

          <p className="text-center text-xs text-muted">
            {t(
              "partnerPublic.apply.footerNote",
              "Apply karne ke baad ye account partner dashboard use karega. Admin 24–48 ghante me review karega.",
            )}
          </p>
        </form>
      </Card>
    </main>
  );
}
