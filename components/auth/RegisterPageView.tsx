"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RegisterPageViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useT } from "@/components/i18n/LanguageProvider";

type Props = { data: RegisterPageViewModel };

export default function RegisterPageView({ data }: Props) {
  const t = useT();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [referral, setReferral] = useState<{ valid: boolean; partnerDisplayName?: string; partnerCity?: string } | null>(
    null,
  );
  const [loginHref, setLoginHref] = useState(data.loginLink.href);
  // A member's invite (`/i/<code>`). Carried by the signed `bt_mref` cookie
  // too — this reads the query string as well because in-app browsers
  // (WhatsApp's on some Android builds) drop the cookie on the redirect, and
  // losing the attribution would silently cost the inviter their reward.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviter, setInviter] = useState<{ valid: boolean; inviterFirstName?: string } | null>(null);

  // Mirrors LoginPageView's own registerHref forwarding: someone who already
  // has an account but no active session (e.g. applying to be a partner)
  // shouldn't lose that "next" just because they clicked "login" instead of
  // filling out this form.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/")) {
      setLoginHref(`${data.loginLink.href}?next=${encodeURIComponent(next)}`);
    }
  }, [data.loginLink.href]);

  // A partner invite (`/j/<token>/start`) forwards the name the partner typed.
  // Prefilled, never locked — it saves typing for someone arriving from a
  // WhatsApp link, but it is the partner's spelling of their name, not a fact
  // about them, so they can change it.
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("name");
    if (name) setFullName(name.slice(0, 80));
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) setInviteCode(code.slice(0, 32).toUpperCase());
  }, []);

  // Confirms the invite is live and says who sent it. A first name is all this
  // returns (see the route) — enough to recognise a friend, not enough to
  // describe a member to somebody guessing codes.
  useEffect(() => {
    if (!inviteCode) return;
    let active = true;
    fetch(`/api/referral/member/validate?code=${encodeURIComponent(inviteCode)}`)
      .then((r) => r.json())
      .then((json) => {
        if (active) setInviter(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [inviteCode]);

  // Confirms who the code belongs to before someone commits to registering
  // under it. An unrecognised code is a note, never a blocker — the account
  // still gets created either way (see /api/auth/register).
  useEffect(() => {
    const code = data.referralCode;
    if (!code) return;
    let active = true;
    fetch(`/api/referral/validate?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((json) => {
        if (active) setReferral(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [data.referralCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("register.error.passwordMismatch", "Password match nahi kar raha."));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          mobile: mobile || undefined,
          email: email || undefined,
          password,
          referral_code: data.referralCode ?? undefined,
          invite_code: inviteCode ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? t("register.error.failed", "Account nahi ban paya."));
        return;
      }
      // Honour wherever middleware sent them here from (e.g. ?next=/partner/register
      // for someone applying to be a partner) — without this they always land on
      // the marriage-profile interview regardless of why they actually signed up.
      const next = new URLSearchParams(window.location.search).get("next");
      // Same server-resolved `landing` as login (lib/auth/postLoginPath.ts). A
      // brand-new account is never "already live", so this is /profile/build —
      // straight to the interview saves the one click through a dashboard that
      // would just show the same "finish your profile" gate anyway.
      router.push(
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : typeof json.landing === "string"
            ? json.landing
            : "/profile/build",
      );
      router.refresh();
    } catch {
      setError(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-[28rem] px-4 py-16">
      {inviter?.valid && (
        /*
         * Same rule as the partner banner below: a name alone is not consent.
         * What an inviting member ever learns about this person is deliberately
         * far less than what a partner does — their first name, and whether
         * they finished their profile — and it is said here, before anything is
         * typed, rather than buried in a policy page.
         */
        <div className="mb-4 rounded-md border border-gold-400 bg-gold-50 px-4 py-3 dark:bg-gold-900/30">
          <p className="text-sm font-medium text-gold-800 dark:text-gold-200">
            {inviter.inviterFirstName} {t("register.invite.invitedYou", "ne aapko BandhanTak par bulaya hai")}.
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
            {t(
              "register.invite.privacyNote",
              "Unhe sirf ye pata chalega: aapka pehla naam aur aapki profile poori hui ya nahi. Aapki profile, photos, matches aur chats unhe kabhi nahi dikhenge.",
            )}
          </p>
        </div>
      )}
      {referral?.valid ? (
        /*
         * M12 §6.4: the referrer's name alone is not consent. Someone signing
         * up through a pandit ji they know in real life deserves to read,
         * before they type anything, exactly how much that person will be able
         * to see — and that it stops well short of their profile and chats.
         */
        <div className="mb-4 rounded-md border border-trust/25 bg-trust-bg px-4 py-3">
          <p className="text-sm font-medium text-trust">
            {referral.partnerDisplayName} {t("register.referral.referredYou", "ne aapko refer kiya hai")}
            {referral.partnerCity ? ` — ${referral.partnerCity}` : ""}.
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
            {t(
              "register.referral.privacyNote",
              "Unhe sirf ye pata chalega: aapka pehla naam, sheher, profile kitni complete hai, aur aapne plan liya ya nahi. Aapki profile, photos, matches aur chats unhe kabhi nahi dikhenge.",
            )}
          </p>
        </div>
      ) : referral && !referral.valid ? (
        <div className="mb-4 rounded-md border border-warn/25 bg-warn-bg px-4 py-3 text-sm text-warn">
          {t(
            "register.referral.unknownCode",
            "Ye referral code pehchana nahi gaya. Aap phir bhi account bana sakte hain.",
          )}
        </div>
      ) : (
        data.referralMessage && (
          <div className="mb-4 rounded-md border border-gold-400 bg-gold-50 px-4 py-3 text-sm font-medium text-gold-800 dark:bg-gold-900/30 dark:text-gold-200">
            {t("register.referral.message", data.referralMessage)}
          </div>
        )
      )}
      <Card padding="lg">
        <h1 className="text-center text-2xl font-bold text-wine-700">
          {t("register.title", "Free Account Banayein")}
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          {t("register.subtitle", "Apni verified marriage profile shuru karein")}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label={t("register.field.fullName", "Poora Naam")}
            name="full_name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label={t("register.field.mobile", "Mobile Number")}
            name="mobile"
            type="tel"
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            helperText={t("register.field.mobileHelp", "Ya neeche email daaliye")}
          />
          <Input
            label={t("register.field.email", "Email (optional)")}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label={t("register.field.password", "Password")}
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText={t("register.field.passwordHelp", "Kam se kam 8 characters")}
            required
          />
          <Input
            label={t("register.field.confirmPassword", "Password Confirm Karein")}
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={loading}>
            {t("register.submit", data.submitLabel)}
          </Button>
        </form>

        {/* Same route as on /login — Google's own consent screen is where the
            "naya account" vs "pehle se hai" distinction gets resolved, so
            there is nothing for this side to decide. */}
        <GoogleSignInButton label="Sign up with Google" />

        <div className="mt-4 border-t border-line pt-4 text-center">
          <a href={loginHref} className="text-sm font-medium text-gold-700">
            {t("register.loginLink", data.loginLink.label)}
          </a>
        </div>
        <div className="mt-4 text-center">
          <a href={data.partnerCTA.href} className="block text-sm text-muted">
            {t("register.partnerCta", data.partnerCTA.label)}
          </a>
          <span className="text-xs text-subtle">
            {t("register.partnerCtaDescription", data.partnerCTA.description)}
          </span>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          {t("register.privacyNote", data.privacyNote)}
        </p>
      </Card>
    </main>
  );
}
