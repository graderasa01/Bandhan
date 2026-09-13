"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Copy, KeyRound, Mic } from "lucide-react";
import type { RegisterPageViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useT } from "@/components/i18n/LanguageProvider";

type Props = { data: RegisterPageViewModel };

/** Browser-generated and never logged. Avoid ambiguous 0/O and 1/l glyphs. */
function makeStrongPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export default function RegisterPageView({ data }: Props) {
  const t = useT();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    loginId: string;
    password: string;
    landing: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [referral, setReferral] = useState<{ valid: boolean; partnerDisplayName?: string; partnerCity?: string } | null>(
    null,
  );
  const [loginHref, setLoginHref] = useState(data.loginLink.href);

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
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? t("register.error.failed", "Account nahi ban paya."));
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Honour wherever middleware sent them here from (e.g.
      // ?next=/partner/register). Otherwise use the same server-resolved
      // landing as login.
      const landing =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : typeof json.landing === "string"
            ? json.landing
            : "/bolo";

      // A generated password is shown exactly once before leaving this page.
      // It is never spoken: a microphone transcript and anyone within earshot
      // are both the wrong place for an account secret.
      if (generatedPassword) {
        setCreatedCredentials({ loginId: mobile || email, password: generatedPassword, landing });
        return;
      }

      router.push(landing);
      router.refresh();
    } catch {
      setError(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setLoading(false);
    }
  }

  function generatePassword() {
    const next = makeStrongPassword();
    setPassword(next);
    setConfirmPassword(next);
    setGeneratedPassword(next);
    setPasswordCopied(false);
  }

  async function copyCredentials() {
    if (!createdCredentials) return;
    try {
      await navigator.clipboard.writeText(
        `BandhanTak Login ID: ${createdCredentials.loginId}\nPassword: ${createdCredentials.password}`,
      );
      setPasswordCopied(true);
    } catch {
      setPasswordCopied(false);
    }
  }

  if (createdCredentials) {
    return (
      <main className="mx-auto max-w-[28rem] px-4 py-16">
        <Card padding="lg">
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-trust-bg text-trust">
              <CheckCircle2 className="size-7" />
            </span>
            <h1 className="mt-4 text-2xl font-bold text-wine-700">
              {t("register.credentials.title", "Account ban gaya")}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {t("register.credentials.saveOnce", "Ye login details abhi save kar lijiye.")}
            </p>
          </div>

          <div className="mt-6 space-y-3 rounded-lg border border-line bg-bg-subtle p-4">
            <div>
              <p className="text-xs text-muted">{t("register.credentials.loginId", "Aapki Login ID")}</p>
              <p className="mt-0.5 break-all font-mono text-base font-semibold text-ink">
                {createdCredentials.loginId}
              </p>
            </div>
            <div className="border-t border-line pt-3">
              <p className="text-xs text-muted">{t("register.credentials.password", "Aapka Password")}</p>
              <p className="mt-0.5 break-all font-mono text-lg font-bold tracking-wide text-ink">
                {createdCredentials.password}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            {t(
              "register.credentials.private",
              "Password kisi ko na batayein. App Setup me jaakar jab chahein badal sakte hain.",
            )}
          </p>

          <div className="mt-5 space-y-3">
            <Button type="button" fullWidth variant="secondary" onClick={() => void copyCredentials()}>
              {passwordCopied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
              {passwordCopied
                ? t("register.credentials.copied", "Copied")
                : t("register.credentials.copy", "Copy Login ID & Password")}
            </Button>
            <Button
              type="button"
              fullWidth
              onClick={() => {
                router.push(createdCredentials.landing);
                router.refresh();
              }}
            >
              {t("register.credentials.continue", "Saved — Continue")}
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[28rem] px-4 py-16">
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

        {/* The fast door. Most people should never see the form below: /bolo
            builds the whole profile by voice and asks for a number last. The
            typed form stays for anyone who prefers it. */}
        <Link
          href="/bolo"
          className="mt-6 flex items-center gap-3 rounded-lg border border-gold-300/70 bg-gold-50/70 p-4 transition-colors hover:border-gold-500 dark:bg-gold-900/20"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
            <Mic className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {t("register.bolo.title", "Bol kar profile banayein — 2 minute")}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              {t("register.bolo.subtitle", "Grio se baat kijiye, profile khud bhar jayegi. Number sirf aakhir me.")}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted" />
        </Link>
        <p className="mt-4 text-center text-xs text-muted">{t("register.bolo.or", "ya form se bharein")}</p>

        <form onSubmit={onSubmit} className="mt-3 space-y-4" noValidate>
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
            helperText={t("register.field.mobileHelp", "Yehi aapki Login ID rahegi — ya neeche email daaliye")}
          />
          <Input
            label={t("register.field.email", "Email (optional)")}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="rounded-lg border border-line bg-bg-subtle p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {t("register.passwordChoice.title", "Password")}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("register.passwordChoice.safe", "Password bolna nahi hai — private rakhein.")}
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={generatePassword}>
                <KeyRound className="size-4" />
                {t("register.passwordChoice.generate", "Generate")}
              </Button>
            </div>

            {generatedPassword && (
              <p className="mt-3 rounded-md border border-trust/25 bg-trust-bg px-3 py-2 text-xs font-medium text-trust">
                {t(
                  "register.passwordChoice.generated",
                  "Majboot password ban gaya. Account banne ke baad ek baar dikhaya jayega.",
                )}
              </p>
            )}

            <div className="mt-3 space-y-3">
              <Input
                label={t("register.field.password", "Password")}
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setGeneratedPassword(null);
                }}
                helperText={t("register.field.passwordHelp", "Kam se kam 8 characters")}
                required
              />
              <Input
                label={t("register.field.confirmPassword", "Password Confirm Karein")}
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setGeneratedPassword(null);
                }}
                required
              />
            </div>
          </div>

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
