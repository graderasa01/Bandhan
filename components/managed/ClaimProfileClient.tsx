"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, CalendarClock, FileText, ShieldCheck, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { ClaimPreview } from "@/lib/services/managedProfile/claimTokenService";

type Viewer =
  | { state: "anonymous" }
  | { state: "unverified"; name: string }
  | { state: "ready"; name: string }
  | { state: "creator" }
  | { state: "wrong_role" };

/**
 * What somebody sees when they open a claim link.
 *
 * The preview above the fold is the entire pre-authentication disclosure: who
 * made this, what they called it, how many answers are in it, when the link
 * dies. Not one field value — not the name on the draft, not the date of
 * birth, not the city. If this link reached the wrong WhatsApp group, nothing
 * on this screen tells that group anything about the person it describes.
 *
 * The claim button appears only for a signed-in member with a proven contact.
 * Everyone else gets the specific next step rather than a disabled button.
 */
export default function ClaimProfileClient({
  token,
  preview,
  viewer,
}: {
  token: string;
  preview: ClaimPreview;
  viewer: Viewer;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCta, setErrorCta] = useState<string | null>(null);

  const returnTo = `/claim-profile/${token}`;
  const expires = new Date(preview.expiresAt);
  const hoursLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 3_600_000));

  async function claim() {
    setBusy(true);
    setError(null);
    setErrorCta(null);
    try {
      const res = await fetch(`/api/managed-profile/claim/${token}`, { method: "POST" });
      const body = (await res.json()) as { next?: string; message?: string; ctaHref?: string | null };
      if (!res.ok || !body.next) {
        setError(body.message ?? "Claim nahi ho paya.");
        setErrorCta(body.ctaHref ?? null);
        setBusy(false);
        return;
      }
      router.push(body.next);
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Card variant="luxe" padding="lg">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
            {preview.creatorKind === "PARTNER" ? (
              <Building2 className="size-6" aria-hidden />
            ) : (
              <Users className="size-6" aria-hidden />
            )}
          </span>
          <h1 className="mt-3 text-xl font-semibold text-wine-700">
            Aapke liye ek profile draft tayyar hai
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {preview.creatorKind === "PARTNER"
              ? preview.partnerName
                ? `${preview.partnerName} (verified BandhanTak partner) ne aapke liye kuch details bhari hain.`
                : "Ek BandhanTak partner ne aapke liye kuch details bhari hain."
              : "Aapke ghar se kisi ne aapke liye kuch details bhari hain."}
          </p>
        </div>

        <dl className="mt-5 divide-y divide-line rounded-lg border border-line bg-bg-subtle">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="inline-flex items-center gap-2 text-sm text-muted">
              <FileText className="size-4" aria-hidden />
              Draft ka naam
            </dt>
            <dd className="truncate text-sm font-medium text-ink">{preview.displayLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="inline-flex items-center gap-2 text-sm text-muted">
              <BadgeCheck className="size-4" aria-hidden />
              Kitni details bhari hain
            </dt>
            <dd className="text-sm font-medium tabular-nums text-ink">{preview.answeredCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="inline-flex items-center gap-2 text-sm text-muted">
              <CalendarClock className="size-4" aria-hidden />
              Link kab tak
            </dt>
            <dd className="text-sm font-medium text-ink">
              {hoursLeft < 1 ? "1 ghante se kam" : `${hoursLeft} ghante`}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-lg border border-info/30 bg-info-bg px-3 py-2.5 text-xs leading-relaxed text-info">
          Details abhi aapko nahi dikhayi ja rahi — pehle login kariye, taaki hum yakeen kar sakein ki ye aap
          hi hain. Uske baad aap ek-ek detail dekh kar confirm, badal ya reject kar sakte hain.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2.5">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            {errorCta && (
              <Link href={`${errorCta}?next=${encodeURIComponent(returnTo)}`} className="mt-2 inline-block">
                <Button size="sm" variant="secondary">
                  Continue
                </Button>
              </Link>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          {viewer.state === "anonymous" && (
            <>
              <Link href={`/register?next=${encodeURIComponent(returnTo)}`}>
                <Button fullWidth>Create Account</Button>
              </Link>
              <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>
                <Button variant="secondary" fullWidth>
                  I Already Have an Account
                </Button>
              </Link>
            </>
          )}

          {viewer.state === "unverified" && (
            <>
              <p className="text-center text-sm text-muted">
                Namaste {viewer.name} — bas apna mobile ya email verify kar lijiye.
              </p>
              <Link href={`/user/verify-contact?next=${encodeURIComponent(returnTo)}`}>
                <Button fullWidth>Verify My Contact</Button>
              </Link>
            </>
          )}

          {viewer.state === "ready" && (
            <>
              <Button onClick={claim} loading={busy} fullWidth>
                Yes, This Is Me — Claim
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted">
                Claim karne se ye details aapki profile par apne aap nahi lagti. Agla step review hai.
              </p>
            </>
          )}

          {viewer.state === "creator" && (
            <p className="rounded-lg border border-warn/40 bg-warn-bg px-3 py-2.5 text-sm text-warn">
              Ye draft aapne khud banaya hai — ise aap claim nahi kar sakte. Link us insaan ko bhejiye jiski
              profile hai.
            </p>
          )}

          {viewer.state === "wrong_role" && (
            <p className="rounded-lg border border-warn/40 bg-warn-bg px-3 py-2.5 text-sm text-warn">
              Ye link member account ke liye hai. Apne member account se login kariye.
            </p>
          )}
        </div>
      </Card>

      <Card variant="soft" padding="md">
        <div className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Profile hamesha aapki rahegi. Jisne draft bhara hai unhe koi bhi permission tabhi milti hai jab aap
            khud dete hain — aur aap ek tap me wapas le sakte hain.
          </p>
        </div>
      </Card>
    </div>
  );
}
